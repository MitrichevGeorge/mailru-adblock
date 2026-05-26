// ==UserScript==
// @name         Mail.ru Advanced AdBlocker & Telemetry Blocker
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Блокирует скрытую рекламу rb-mimic и глушит отправку телеметрии X-Ray на доменах Mail.ru (включая iframe-виджеты)
// @author       george
// @match        https://*.mail.ru/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=mail.ru
// @allFrames    true
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    window._pendingLogs = [];

    function logToUI(message, type = 'warning') {
        const content = document.getElementById('adblock-log-content');
        if (!content) {
            window._pendingLogs.push({ msg: message, type });
            return;
        }
        const entry = document.createElement('div');
        entry.className = 'adblock-log-entry';
        
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'adblock-log-time';
        timeSpan.textContent = `[${timeStr}]`;
        
        const msgSpan = document.createElement('span');
        if (type === 'success') msgSpan.style.color = '#00ff66';
        else if (type === 'danger') msgSpan.style.color = '#ff3333';
        else if (type === 'telemetry') msgSpan.style.color = '#00ccff';
        else msgSpan.style.color = '#ffcc00';
        
        msgSpan.textContent = message;
        
        entry.appendChild(timeSpan);
        entry.appendChild(msgSpan);
        content.appendChild(entry);
        content.scrollTop = content.scrollHeight;
    }

    function isAdContent(str) {
        if (!str) return false;
        try {
            const decoded = decodeURIComponent(str);
            return decoded.includes('rb-mimic') || decoded.includes('api-proxy') || decoded.includes('target.my.com');
        } catch (e) {
            return str.includes('rb-mimic') || str.includes('api-proxy');
        }
    }

    function isTelemetryContent(str) {
        if (!str) return false;
        return str.includes('xray/batch');
    }

    const mockAdResponse = [{"json":{"result":{"status":200,"body":{"direct":{"ads":[]}}}}}] ;
    
    const transparentPixelBase64 = "R0lGODlhAQABAIABAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICTAEAOw==";

    const isMainContext = window === window.top;
    const contextLabel = isMainContext ? "[Главное окно]" : "[Виджет/Фрейм]";

    logToUI(`${contextLabel} Инициализация перехватчиков сети...`, "info");

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let [resource, config] = args;
        let url = typeof resource === 'string' ? resource : (resource?.url || '');
        let body = config && config.body ? config.body : '';
        
        let bodyStr = '';
        if (typeof body === 'string') bodyStr = body;
        else if (body instanceof URLSearchParams) bodyStr = body.toString();
        else if (body instanceof FormData) {
            try { bodyStr = new URLSearchParams(body).toString(); } catch(e){}
        }

        if (isAdContent(url) || isAdContent(bodyStr)) {
            logToUI(`${contextLabel} [Fetch] Заблокирован рекламный запрос к api/v1 (rb-mimic)`, 'danger');
            return new Response(JSON.stringify(mockAdResponse), {
                status: 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        }

        if (isTelemetryContent(url) || isTelemetryContent(bodyStr)) {
            logToUI(`${contextLabel} [Telemetry] Успешно перехвачен и ослеплен батч логов X-Ray`, 'telemetry');
            return new Response(atob(transparentPixelBase64), {
                status: 200,
                headers: { 'Content-Type': 'image/gif' }
            });
        }

        return originalFetch.apply(this, args);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._url = url;
        return originalOpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function(body) {
        let bodyStr = '';
        if (typeof body === 'string') bodyStr = body;
        else if (body instanceof URLSearchParams) bodyStr = body.toString();
        else if (body instanceof FormData) {
            try { bodyStr = new URLSearchParams(body).toString(); } catch(e){}
        }
        
        if (isAdContent(this._url) || isAdContent(bodyStr)) {
            logToUI(`${contextLabel} [XHR] Заблокирован рекламный запрос к api/v1 (rb-mimic)`, 'danger');
            
            Object.defineProperty(this, 'readyState', { writable: true, value: 4 });
            Object.defineProperty(this, 'status', { writable: true, value: 200 });
            Object.defineProperty(this, 'statusText', { writable: true, value: 'OK' });
            
            const dummyResponse = JSON.stringify(mockAdResponse);
            Object.defineProperty(this, 'responseText', { writable: true, value: dummyResponse });
            Object.defineProperty(this, 'response', { writable: true, value: dummyResponse });
            
            if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
            this.dispatchEvent(new Event('readystatechange'));
            this.dispatchEvent(new Event('load'));
            return; 
        }

        if (isTelemetryContent(this._url) || isTelemetryContent(bodyStr)) {
            logToUI(`${contextLabel} [XHR] Успешно перехвачен и ослеплен батч логов X-Ray`, 'telemetry');
            
            Object.defineProperty(this, 'readyState', { writable: true, value: 4 });
            Object.defineProperty(this, 'status', { writable: true, value: 200 });
            Object.defineProperty(this, 'statusText', { writable: true, value: 'OK' });
            
            Object.defineProperty(this, 'responseText', { writable: true, value: atob(transparentPixelBase64) });
            Object.defineProperty(this, 'response', { writable: true, value: atob(transparentPixelBase64) });
            
            if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
            this.dispatchEvent(new Event('readystatechange'));
            this.dispatchEvent(new Event('load'));
            return;
        }

        return originalSend.apply(this, arguments);
    };

    const adSelectors = [
        'div[class*="rb-mimic"]',
        'div[id*="rb-mimic"]',
        'a[href*="target.my.com"]',
        '[data-testid="recolaw"]',
        '.mail-ads',
        'div[class*="context-vmail"]'
    ];

    function cleanDOM() {
        adSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                logToUI(`${contextLabel} [DOM] Удален визуальный рекламный блок: ${selector}`, 'success');
                el.remove();
            });
        });
    }
    setInterval(cleanDOM, 1500);

    const uiStyles = `
        #adblock-log-trigger {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            background: #181a1b;
            color: #00ff66;
            border: 1px solid #3c4144;
            border-radius: 4px;
            padding: 8px 14px;
            font-family: monospace;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            transition: all 0.2s ease;
        }
        #adblock-log-trigger:hover {
            background: #00ff66;
            color: #181a1b;
            border-color: #00ff66;
        }
        #adblock-log-overlay {
            position: fixed;
            bottom: 65px;
            right: 20px;
            width: 550px;
            max-width: 90vw;
            height: 380px;
            max-height: 60vh;
            background: #181a1b;
            color: #e8e6e3;
            z-index: 999998;
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.7);
            font-family: 'Courier New', monospace;
            display: none;
            flex-direction: column;
            border: 1px solid #3c4144;
            overflow: hidden;
        }
        #adblock-log-header {
            background: #222627;
            padding: 10px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #3c4144;
            font-size: 13px;
        }
        #adblock-log-controls button {
            background: #2a2e30;
            color: #e8e6e3;
            border: 1px solid #444;
            padding: 3px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            margin-left: 6px;
        }
        #adblock-log-controls button:hover {
            background: #353a3c;
            border-color: #666;
        }
        #adblock-log-content {
            padding: 12px;
            overflow-y: auto;
            flex-grow: 1;
            font-size: 12px;
            line-height: 1.4;
            background: #121314;
        }
        .adblock-log-entry {
            margin-bottom: 6px;
            border-bottom: 1px solid #1c1e1f;
            padding-bottom: 4px;
            word-break: break-all;
        }
        .adblock-log-time {
            color: #727b82;
            margin-right: 6px;
        }
    `;

    function initUI() {
        if (!isMainContext) return;
        if (document.getElementById('adblock-log-trigger')) return;

        const styleEl = document.createElement('style');
        styleEl.textContent = uiStyles;
        document.head.appendChild(styleEl);

        const triggerBtn = document.createElement('button');
        triggerBtn.id = 'adblock-log-trigger';
        triggerBtn.innerHTML = 'E';
        document.body.appendChild(triggerBtn);

        const overlayDiv = document.createElement('div');
        overlayDiv.id = 'adblock-log-overlay';
        overlayDiv.innerHTML = `
            <div id="adblock-log-header">
                <span>Mail.ru AdBlock & Telemetry Monitor v5.0</span>
                <div id="adblock-log-controls">
                    <button id="adblock-log-clear">Очистить</button>
                    <button id="adblock-log-close">Скрыть</button>
                </div>
            </div>
            <div id="adblock-log-content"></div>
        `;
        document.body.appendChild(overlayDiv);

        triggerBtn.addEventListener('click', () => {
            overlayDiv.style.display = overlayDiv.style.display === 'flex' ? 'none' : 'flex';
        });

        document.getElementById('adblock-log-close').addEventListener('click', () => {
            overlayDiv.style.display = 'none';
        });

        document.getElementById('adblock-log-clear').addEventListener('click', () => {
            document.getElementById('adblock-log-content').innerHTML = '';
        });

        if (window._pendingLogs && window._pendingLogs.length > 0) {
            window._pendingLogs.forEach(log => logToUI(log.msg, log.type));
            window._pendingLogs = [];
        }
    }

    if (document.body) {
        initUI();
    } else {
        window.addEventListener('DOMContentLoaded', initUI);
    }

})();
