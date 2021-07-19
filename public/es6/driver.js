// driver.js is a wrapper for the Canvas-based terminal.  It sits between the
// browser and the terminal and massages keystroke events as needed.

let T$ = require('./terminal.js');

/* global goog */
goog.require('goog.events');
goog.require('goog.events.KeyCodes');
goog.require('goog.events.KeyHandler');
goog.require('goog.Timer');

let term;

function keyPressedCallback(event) {
  let key = event.charCode;

  // Handle non-printable characters specially.
  if (event.charCode === 0) {
    switch (event.keyCode) {
      case goog.events.KeyCodes.BACKSPACE:
      case goog.events.KeyCodes.ENTER:
      case goog.events.KeyCodes.TAB:
        event.preventDefault();
        key = event.keyCode;
        break;
      default:
        return;
    }
  }

  term.send(key);
}

module.exports = {
  getParam(name) {
    const vars = decodeURIComponent(window.location.href.slice(window.location.href.indexOf('?') + 1));
    const pairs = vars.split('&');
    for (let pair of pairs) {
      const parts = pair.split('=', 2);
      if (parts[0] === name) {
        return parts[1];
      }
    }
    return '';
  },

  start() {
    console.log('Initializing Canvas Terminal.');
    term = T$.canvas(132, 50);

    let redrawCallback = () => { term.draw(); };
    let redrawTimer = new goog.Timer(16);
    redrawTimer.start();
    goog.events.listen(redrawTimer, goog.Timer.TICK, redrawCallback);

    let keyboard = new goog.events.KeyHandler(document, false);
    goog.events.listen(keyboard, goog.events.KeyEvent.EventType.KEY, keyPressedCallback);

    window.addEventListener('resize', (e) => { term.resize(e); });
  },
};
