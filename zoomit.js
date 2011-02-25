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
    
    function makeApiUrlById(type, id, callbackName) {
        return [
            Zoomit.apiPath,
            'v1/',
            type,
            '/',
            id,
            '?callback=',
            encodeURIComponent(callbackName)
        ].join('');
    }
    
    function makeApiUrlByUrl(type, url, callbackName) {
        return [
            Zoomit.apiPath,
            'v1/',
            type,
            '/',
            '?callback=',
            encodeURIComponent(callbackName),
            '&url=',
            encodeURIComponent(url)
        ].join('');
    }
    
    function makeApiRequest(type, id, url, callbacks) {

        var jsonpScript;    // will be the <script> element used for JSONP
        var callbackName = makeGlobalWrapper(function (resp) {

            // "garbage collect" the JSONP request from the DOM
            jsonpScript.parentNode.removeChild(jsonpScript);
            
            var status = resp.status;
            var statusClass = Math.floor(status / 100);     // e.g. 503 -> 5
            
            var callback = callbacks[status] || callbacks[statusClass + "xx"];
            
            // special case for convenience -- "2xx/3xx" support:
            if (!callback && (statusClass === 2 || statusClass === 3)) {
                callback = callbacks["2xx/3xx"];
            }
            
            if (callback) {
                callback(resp);
            }

        });

        var idOrUrl = id || url;
        var reqUrlFunc = id ? makeApiUrlById : makeApiUrlByUrl;
        var requestUrl = reqUrlFunc(type, idOrUrl, callbackName);

        jsonpScript = makeScriptRequest(requestUrl);
        
    }
    
    // PUBLIC METHODS
    
    /**
     * Asynchronously fetches Zoom.it content info from the given ID or URL
     * and calls one of the given callback functions as appropriate.
     * 
     * Options:
     * - id: either this or url required
     * - url: either this or id required
     * - down: optional callback(message) for API down
     * - error: optional callback(message) for bad request
     * - ready: required callback(content) for content ready
     * - failed: optional callback(content) for content failed
     * - progress: optional callback(content) for content in progress
     *
     * All callbacks also receive the original opts as a second parameter and
     * the entire response object as a third parameter.
     */
    Zoomit.getContentInfo = function (opts) {
        
        function callback(resp, func, arg) {
            if (func) {
                func(arg, opts, resp);
            }
        }
        
        makeApiRequest("content", opts.id, opts.url, {
            
            // successful req returns 200 if by ID but 301 if by URL
            "2xx/3xx": function (resp) {
                var content = resp.content;
                if (content.ready) {
                    callback(resp, opts.ready, content);
                } else if (content.failed) {
                    callback(resp, opts.failed, content);
                } else {
                    callback(resp, opts.progress, content);
                }
            },
            
            // e.g. 400 for malformed URL, 404 for unrecognized ID
            "4xx": function (resp) {
                callback(resp, opts.error, resp.error);
            },
            
            // e.g. 500 for internal server error, 503 for API down
            "5xx": function (resp) {
                callback(resp, opts.down, resp.error);
            }
            
        });
        
    };

    /**
     * Asynchronously fetches Zoom.it DZI info from the given ID or URL
     * and calls one of the given callback functions as appropriate.
     * 
     * Options:
     * - id: either this or url required
     * - url: either this or id required
     * - down: optional callback(message) for API down
     * - error: optional callback(message) for bad request
     * - ready: required callback(dzi) for DZI ready
     * - failed: optional callback() for DZI failed
     * - progress: optional callback() for DZI in progress
     *
     * All callbacks also receive the original opts and the entire response
     * object as two additional parameters.
     *
     * Note that certain bad requests are not detectable as such and may
     * appear to be failed DZIs instead. For example, it isn't possible to
     * distinguish between an unrecognized ID and a failed DZI.
     */
    Zoomit.getDziInfo = function (opts) {
        
        function callback(resp, func, arg) {
            if (func) {
                if (arg) {
                    func(arg, opts, resp);
                } else {
                    func(opts, resp);
                }
            }
        }
        
        makeApiRequest("dzi", opts.id, opts.url, {
            
            // DZI ready always returns 301 currently, but future-proofing...
            "2xx/3xx": function (resp) {
                callback(resp, opts.ready, resp.dzi);
            },
            
            // DZI isn't ready; retryAfter determines in progress or failed.
            // note how we fail to catch 404 for unrecognized ID!
            "404": function (resp) {
                if (resp.retryAfter) {
                    callback(resp, opts.progress);
                } else {
                    callback(resp, opts.failed);
                }
            },
            
            // e.g. 400 for malformed URL
            "4xx": function (resp) {
                callback(resp, opts.error, resp.error);
            },
            
            // e.g. 500 for internal server error, 503 for API down
            "5xx": function (resp) {
                callback(resp, opts.down, resp.error);
            }
            
        });
        
    };

}(window, document));