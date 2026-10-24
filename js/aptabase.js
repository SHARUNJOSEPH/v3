(function(window) {
    'use strict';
    
    const hosts = {
        US: "https://us.aptabase.com",
        EU: "https://eu.aptabase.com",
        DEV: "http://localhost:3000",
        SH: ""
    };
    
    let cachedLocale;
    let isDebugMode;
    let sessionId = generateSessionId();
    let lastSessionTime = new Date();
    const SESSION_TIMEOUT_SEC = 3600; // 1 hour
    const SDK_VERSION = "aptabase-web@0.5.0";
    
    let appKey = "";
    let apiUrl = "";
    let appOptions = {};
    
    function generateSessionId() {
        const timePart = Math.floor(Date.now() / 1000).toString();
        const randPart = Math.floor(Math.random() * 100000000).toString().padStart(8, "0");
        return timePart + randPart;
    }
    
    function refreshSession() {
        const now = new Date();
        const elapsedSec = Math.floor((now.getTime() - lastSessionTime.getTime()) / 1000);
        if (elapsedSec > SESSION_TIMEOUT_SEC) {
            sessionId = generateSessionId();
        }
        lastSessionTime = now;
        return sessionId;
    }
    
    function getLocale() {
        if (cachedLocale) return cachedLocale;
        if (typeof navigator !== "undefined") {
            cachedLocale = (navigator.languages && navigator.languages.length > 0) ? navigator.languages[0] : navigator.language;
            return cachedLocale;
        }
        return "en-US";
    }
    
    function getIsDebug() {
        if (isDebugMode !== undefined) return isDebugMode;
        if (typeof location !== "undefined") {
            isDebugMode = location.hostname === "localhost" || location.hostname === "127.0.0.1";
            return isDebugMode;
        }
        return false;
    }
    
    function init(key, options) {
        if (!key || typeof key !== "string") {
            console.warn("Aptabase: App Key is invalid.");
            return;
        }
        const parts = key.split("-");
        if (parts.length !== 3 || !hosts[parts[1]]) {
            console.warn(`Aptabase: App Key "${key}" format is invalid.`);
            return;
        }
        appKey = key;
        appOptions = options || {};
        apiUrl = (appOptions.host || hosts[parts[1]]) + "/api/v0/event";
        console.log("Aptabase: Initialized with App Key:", key);
    }
    
    async function trackEvent(eventName, props) {
        if (!appKey || !apiUrl) {
            return;
        }
        if (typeof fetch !== "function") {
            return;
        }
        const currentSession = refreshSession();
        try {
            const body = {
                timestamp: new Date().toISOString(),
                sessionId: currentSession,
                eventName: eventName,
                systemProps: {
                    locale: getLocale(),
                    isDebug: getIsDebug(),
                    appVersion: appOptions.appVersion || "1.0.0",
                    sdkVersion: SDK_VERSION
                },
                props: props || {}
            };
            
            await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "App-Key": appKey
                },
                credentials: "omit",
                body: JSON.stringify(body)
            });
        } catch (err) {
            // Silently ignore network or offline failures
        }
    }
    
    window.Aptabase = {
        init: init,
        trackEvent: trackEvent
    };
})(window);
