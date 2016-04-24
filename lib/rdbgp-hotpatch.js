var fs = require('fs');
var fsobserve = require('fsobserve');
var path = require('path');
var urlparse = require('url').parse;

function hotpatch(client, options) {
  if (!options) {
    options = {};
  }

  var resolve = options.resolve || function(url, callback) {
    var urlobj = urlparse(url || '');

    var filename = path.normalize(urlobj.pathname || '');
    if (/^http/.test(urlobj.protocol)) {
      filename = path.resolve(process.cwd(), filename);
    }

    fs.realpath(filename, callback);
  };

  var transform = options.transform || function(source, callback) {
    return callback(null, source);
  };

  var breakpoints = {};
  var scripts = {};
  var styleSheets = {};

  if (client.socket) {
    client.request('DOM.enable');
    client.request('CSS.enable');
    client.request('Debugger.enable');
    client.request('Runtime.enable');
    client.request('Network.enable');
    client.request('Page.enable');
    client.request('Page.reload');
  }

  client.on('ready', function() {
    client.request('DOM.enable');
    client.request('CSS.enable');
    client.request('Debugger.enable');
    client.request('Runtime.enable');
    client.request('Network.enable');
    client.request('Page.enable');
    client.request('Page.reload');
  });

  client.on('data', function(response) {
    if (response.method === 'Debugger.globalObjectCleared') {
      Object.keys(scripts).forEach(function(key) {
        delete scripts[key];
      });
    }

    if (response.method === 'Debugger.breakpointResolved') {
      breakpoints[response.params.breakpointId] = response.params;
    }

    if (response.method === 'Debugger.paused') {
      var hitBreakpoints = response.params.hitBreakpoints.map(function(id) {
        return breakpoints[id];
      });

      var location = hitBreakpoints[0].location;
      client.request('Debugger.getScriptSource', {
        scriptId: location.scriptId,
      }, function(error, source) {
        transform(source, function(error, scriptSource) {
          if (error) {
            return;
          }

          client.request('Debugger.setScriptSource', {
            scriptId: location.scriptId,
            scriptSource: scriptSource,
          }, function(error, result) {
            client.request('Debugger.resume');
          });
        });
      });
    }

    if (response.method === 'Debugger.scriptParsed') {
      var script = response.params;

      if (script.isInternalScript) {
        return;
      }

      resolve(script.url, function(error, filename) {
        if (filename) {
          scripts[filename] = script;
          watch.add(filename);
        }
      });
    }

    if (response.method === 'DOM.documentUpdated') {
      Object.keys(styleSheets).forEach(function(key) {
        delete styleSheets[key];
      });
    }

    if (response.method === 'CSS.styleSheetAdded') {
      var styleSheet = response.params.header;

      if (styleSheet.isInline) {
        return;
      }

      resolve(styleSheet.sourceURL, function(error, filename) {
        if (filename) {
          styleSheets[filename] = styleSheet;
          watch.add(filename);
        }
      });
    }

    if (response.method === 'Network.requestWillBeSent') {
      var request = response.params.request;
      if (/\.js$/.test(request.url)) {
        client.request('Debugger.setBreakpointByUrl', {
          lineNumber: 0,
          url: request.url,
          condition: 'document.readyState !== \'complete\'',
        });
      }
    }
  });

  var watch = fsobserve();
  watch.on('data', function(change) {
    var filename = change.name;

    if (change.type === 'update') {
      fs.readFile(filename, 'utf-8', function(error, source) {
        if (scripts[filename]) {
          transform(source, function(error, scriptSource) {
            if (error) {
              return;
            }

            client.request('Debugger.setScriptSource', {
              scriptId: scripts[filename].scriptId,
              scriptSource: scriptSource,
            });
          });
        }

        if (styleSheets[filename]) {
          client.request('CSS.setStyleSheetText', {
            styleSheetId: styleSheets[filename].styleSheetId,
            text: source,
          });
        }
      });
    }
  });

  return watch;
}

module.exports = hotpatch;
