// zoomit.js
// A JavaScript wrapper library for the Zoom.it API <http://api.zoom.it/>.
//
// Copyright (c) 2011 Aseem Kishore <https://github.com/aseemk>
// MIT License (http://www.opensource.org/licenses/mit-license.php)
//
// Features:
// - doesn't require jQuery or any other JS library
//
// TODO:
// - support streamlined DZI endpoint (/v1/dzi)
// - add convenience wrappers for thumbnail URLs (zoomit://thumbnail/?url=)
// - support batch API: combine multiple requests into one (POST via XHR/XDR)
// - differentiate client vs. server errors? (e.g. bad req vs. site down)

(function (window, document) {
    
    var Zoomit = window.Zoomit = {};
    
    // CONFIGURATION
    
    /**
     * The path to the web API. This path can be an absolute URL or a relative
     * one, but it must end with a slash.
     * By default, this path is "http://api.zoom.it/", but this hook is
     * provided for testability against staging environments.
     */
    Zoomit.apiPath = "http://api.zoom.it/";
    
    // JSONP HELPERS
    
    function makeScriptRequest(src) {
        var script = document.createElement("script");
        
        script.src = src;
        (document.body || document.documentElement).appendChild(script);
        
        return script;
    }
    
    function makeGlobalWrapper(actualCallback) {
        var name = "_jsonCallback" +
                Math.round(Math.random() * 100000000).toString();
        
        window[name] = function () {
            actualCallback.apply(this, arguments);
            try {
                delete window[name];    // this doesn't work in IE7-...
            } catch (e) {
                window[name] = undefined;   // ...so we fallback to this.
            }
        };
        
        return name;
    }
    
    // API HELPERS
    
    function makeApiUrlById(id, callbackName) {
        return [
            Zoomit.apiPath,
            'v1/content/',
            id,
            '?callback=',
            encodeURIComponent(callbackName)
        ].join('');
    }
    
    function makeApiUrlByUrl(url, callbackName) {
        return [
            Zoomit.apiPath,
            'v1/content/',
            '?callback=',
            encodeURIComponent(callbackName),
            '&url=',
            encodeURIComponent(url)
        ].join('');
    }
    
    // PUBLIC METHODS
    
    /**
     * Asynchronously fetches Zoom.it content info from the given ID or URL
     * and calls one of the given callback functions as appropriate.
     * 
     * Options:
     * - id: either this or url required
     * - url: either this or id required
     * - error: optional callback(error) for bad request
     * - ready: required callback(content) for content ready
     * - failed: optional callback(content) for content failed
     * - processing: optional callback(content) for content processing
     *
     * All callbacks also receive the original opts as a second parameter and
     * the entire response object as a third parameter.
     */
    Zoomit.getContentInfo = function (opts) {
        
        var jsonpScript;    // will be the <script> element used for JSONP
        var callbackName = makeGlobalWrapper(function (resp) {
            
            // "garbage collect" the JSONP request from the DOM
            jsonpScript.parentNode.removeChild(script);
            
            function callback(func, arg) {
                if (func) {
                    func(arg, opts, resp)
                }
            }
            
            var error = resp.error;
            if (error) {
                callback(opts.error, error);
                return;
            }
            
            var content = resp.content;
            if (content.ready) {
                callback(opts.ready, content);
            } else if (content.failed) {
                callback(opts.failed, content);
            } else {
                callback(opts.processing, content);
            }
            
        });
        
        var idOrUrl = opts.id || opts.url;
        var reqUrlFunc = opts.id ? makeApiUrlById : makeApiUrlByUrl;
        var requestUrl = reqUrlFunc(idOrUrl, callbackName);
        
        jsonpScript = makeScriptRequest(requestUrl);
        
    };

}(window, document));