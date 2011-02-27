// zoomit.js
// A JavaScript wrapper library for the Zoom.it API <http://api.zoom.it/>.
//
// Copyright (c) 2011 Aseem Kishore <https://github.com/aseemk>
// MIT License (http://www.opensource.org/licenses/mit-license.php)

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
    
    function makeThumbnailUrl(url) {
        return url && "zoomit://thumbnail/?url=" + encodeURIComponent(url);
    }
    
    function makeThumbnailObject(dzi) {
        // assuming that thumbnails are always 1024x768 with a tile size of
        // 1024px, a tile overlap of 0 and a tile format of "png", as per:
        // http://getsatisfaction.com/livelabs/topics/final_updates_to_seadragon_ajax_and_zoom_it
        
        // TEMP also assuming that DZI URLs always end in ".dzi". this isn't
        // publicly documented or guaranteed, but it's a safe assumption.
        
        console.log(dzi);
        
        var base = dzi.url.replace(".dzi", "_files/");
        var thumb = {};
        
        for (var level = 0; level <= 10; level++) {
            // TEMP TODO what should the thumbnail object look like??
            // for now, using keys like "1024", "512", "256" and so on.
            thumb[Math.pow(2, level)] = base + level + "/0_0.png";
        }
        
        return thumb;
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
    Zoomit.getContent = function (opts) {
        
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
    Zoomit.getDzi = function (opts) {
        
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

    /**
     * Asynchronously fetches Zoom.it thumbnail info from the given ID or URL
     * and calls one of the given callback functions as appropriate.
     * 
     * Options:
     * - id: either this or url required
     * - url: either this or id required
     * - down: optional callback(message) for API down
     * - error: optional callback(message) for bad request
     * - ready: required callback(thumbnail) for thumbnail ready
     * - failed: optional callback() for thumbnail failed
     * - progress: optional callback() for thumbnail in progress
     *
     * All callbacks also receive the original opts and the entire response
     * object as two additional parameters.
     *
     * Note that certain bad requests are not detectable as such and may
     * appear to be failed thumbnails instead. For example, it isn't possible
     * to distinguish between an unrecognized ID and a failed thumbnail.
     */
    Zoomit.getThumbnail = function (opts) {
    
        function callback(resp, func, arg) {
            if (func) {
                if (arg) {
                    func(arg, opts, resp);
                } else {
                    func(opts, resp);
                }
            }
        }
    
        return Zoomit.getDzi({
            
            id: opts.id,
            
            url: makeThumbnailUrl(opts.url),
            
            down: function (message, opts2, resp) {
                callback(resp, opts.down, message);
            },
            
            error: function (message, opts2, resp) {
                callback(resp, opts.error, message);
            },
            
            ready: function (dzi, opts2, resp) {
                callback(resp, opts.ready, makeThumbnailObject(dzi));
            },
            
            failed: function (opts2, resp) {
                callback(resp, opts.failed);
            },
            
            progress: function (opts2, resp) {
                callback(resp, opts.progress);
            }
            
        });
        
    };
    
}(window, document));