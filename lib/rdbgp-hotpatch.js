var fs = require('fs');
var fsobserve = require('fsobserve');
var path = require('path');
var urlparse = require('url').parse;

function hotpatch(client, options) {
  if (!options) {
    options = {};
  }

  var resolve = options.resolve || function(url, callback) {
    var urlobj = urlparse(url);

    var filename = path.normalize(urlobj.pathname);
    if (/^http/.test(urlobj.protocol)) {
      filename = path.resolve(process.cwd(), filename);
    }

    fs.realpath(filename, callback);
  };

  var scripts = {};
  var styleSheets = {};

  // TODO support this directly kind of behavior on rdbgp.Client
  if (client.socket) {
    client.request('DOM.enable');
    client.request('CSS.enable');
    client.request('Debugger.enable');
    client.request('Runtime.enable');
  } else {
    client.on('ready', function() {
      client.request('DOM.enable');
      client.request('CSS.enable');
      client.request('Debugger.enable');
      client.request('Runtime.enable');
    });
  }

  client.on('data', function(response) {
    if (response.method === 'Debugger.globalObjectCleared') {
      Object.keys(scripts).forEach(function(key) {
        delete scripts[key];
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
  });

  var watch = fsobserve();
  watch.on('data', function(change) {
    var filename = change.name;

    if (change.type === 'update') {
      fs.readFile(filename, 'utf-8', function(error, source) {
        if (scripts[filename]) {
          client.request('Debugger.setScriptSource', {
            scriptId: scripts[filename].scriptId,
            scriptSource: source,
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
