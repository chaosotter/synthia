// Terminal abstraction for Synthia.
//
// This package is meant to allow Synthia to function as either a console
// application *or* a standard terminal hosted in a Web container.
//
// noinspection JSUnusedGlobalSymbols

let readline;
try {
  readline = require('readline-sync');
} catch (err) {
  console.log('Could not initialize readline-sync.');
  console.log('(This is fine if using the Canvas Terminal.)');
}

/** @type {string} ANSI escape sequence. */
const CSI = '\x1b[';

class Color {
  /**
   * @param {number} val Numeric code for this color.
   * @param {string} hex RGB hex string for this color.
   */
  constructor(val, hex) {
    this.val = val;
    this.hex = hex;
  }
}

/** @type {Color} The basic set of colors. */
const BLACK       = new Color( 0, '#000000');
const DIM_RED     = new Color( 1, '#aa0000');
const DIM_GREEN   = new Color( 2, '#00aa00');
const DIM_YELLOW  = new Color( 3, '#aa5500');
const DIM_BLUE    = new Color( 4, '#0000aa');
const DIM_MAGENTA = new Color( 5, '#aa00aa');
const DIM_CYAN    = new Color( 6, '#00aaaa');
const DIM_WHITE   = new Color( 7, '#aaaaaa');
const GRAY        = new Color( 8, '#555555');
const RED         = new Color( 9, '#ff5555');
const GREEN       = new Color(10, '#55ff55');
const YELLOW      = new Color(11, '#ffff55');
const BLUE        = new Color(12, '#5555ff');
const MAGENTA     = new Color(13, '#ff55ff');
const CYAN        = new Color(14, '#55ffff');
const WHITE       = new Color(15, '#ffffff');
const NONE        = new Color(16, '');  // used to avoid changing color

/** @type {Object.<string, function>} Used to invoke embedded color codes. */
const embeddedCodes = {
  '_': () => term.reset(),
  'k': () => term.fg(BLACK),
  'r': () => term.fg(DIM_RED),
  'g': () => term.fg(DIM_GREEN),
  'y': () => term.fg(DIM_YELLOW),
  'b': () => term.fg(DIM_BLUE),
  'm': () => term.fg(DIM_MAGENTA),
  'c': () => term.fg(DIM_CYAN),
  'w': () => term.fg(DIM_WHITE),
  'K': () => term.fg(GRAY),
  'R': () => term.fg(RED),
  'G': () => term.fg(GREEN),
  'Y': () => term.fg(YELLOW),
  'B': () => term.fg(BLUE),
  'M': () => term.fg(MAGENTA),
  'C': () => term.fg(CYAN),
  'W': () => term.fg(WHITE),
  'V': () => term.reverse(true),
  'v': () => term.reverse(false),
};

//------------------------------------------------------------------------------

/**
 * Console-based implementation of the terminal for use at the command line.
 */
class ConsoleTerm {
  constructor() {}

  /**
   * Sets the foreground color.
   * @param {Color} color Foreground color to use.
   */
  fg(color) {
    if (color.val !== NONE.val) {
      if (color.val >= GRAY.val) {  // bright color
        this.output(`${CSI}3${color.val - 8};1m`);
      } else {
        this.output(`${CSI}3${color.val};22m`);
      }
    }
  }

  /**
   * Sets the background color.
   * @param {Color} color Background color to use.
   */
  bg(color) {
    if (color.val !== NONE.val) {
      this.output(`${CSI}4${color.val % 8}m`);
    }
  }

  /** Resets foreground and background colors. */
  reset() { this.output(`${CSI}0m`) }

  /** Clears the screen.*/
  clear() { this.output(`${CSI}2J`) }

  /** Cursor control. */
  xy(x, y)     { this.output(`${CSI}${y+1};${x+1}H`) }
  home()       { this.output(`${CSI}1;1H`) }
  up(n = 1)    { this.output(`${CSI}${n}A`) }
  down(n = 1)  { this.output(`${CSI}${n}B`) }
  left(n = 1)  { this.output(`${CSI}${n}D`) }
  right(n = 1) { this.output(`${CSI}${n}C`) }

  /** Reverse video. */
  reverse(state) { this.output(`${CSI}${state ? '7' : '27'}m`) }

  /**
   * Low-level output function.  This processes the input character by
   * character, interpreting embedded color codes such as {W} using the
   * embedded codes map.
   * @param {string} str The string to output.
   */
  output(str) {
    let inCode = false;
    let code = '';

    for (let ch of str) {
      if (inCode) {
        switch (ch) {
          case '{':
            process.stdout.write(ch);
            inCode = false;
            break;
          case '}':
            embeddedCodes[code]();
            [inCode, code] = [false, ''];
            break;
          default:
            code += ch;
        }
      } else if (ch === '{') {
        inCode = true;
      } else {
        process.stdout.write(ch);
      }
    }
  }

  /**
   * Reads a full of line of input, with an optional prompt.
   * @param {string} prompt Prompt for the user.
   * @returns {string} The user input.
   */
  input(prompt = '') {
    this.output(prompt);
    return readline.question('');
  }

  /**
   * Moves the cursor ahead to column |n|.  This currently does not wrap if
   * necessary, which could bork some programs.
   * @param {number} n The tab column.
   */
  tab(n) {
    this.output(`${CSI}${n}G`);
  }
}

//------------------------------------------------------------------------------

/** Represents the combination of a character with color elements. */
class Texel {
  /**
   * @param {string} ch The character at this position.
   * @param {Color} fg The foreground color (expressed as '#xxxxxx').
   * @param {Color} bg The background color (expressed as '#xxxxxx').
   */
  constructor(ch, fg, bg) {
    this.update(ch, fg, bg);
  }

  update(ch, fg, bg) {
    this.ch = ch;
    this.fg = fg;
    this.bg = bg;
  }
}

/** @type {number} Basic size of a character in pixels. */
const CHAR_SIZE = 16;

/** @type {number} Half the size of a single character in pixels. */
const HALF_SIZE = 8;

/** @type {string} Default display font. */
const FONT = 'bold 18px courier';

/** @type {number} Blink rate for the cursor. */
const BLINK_RATE = 8;

/**
 * Canvas-based implementation of the terminal for use in a Web page.
 *
 * This assumes the existence of a Canvas with id 'terminal' inside an enclosing
 * div with id 'application'.
 */
class CanvasTerm {
  constructor(cols=80, rows=25) {
    /** @type {Array.<Array.<Texel>>} The 2D array of character elements. */
    this.screen = null;

    /** @type {number} The number of columns supported. */
    this.cols = cols;

    /** @type {number} The number of rows supported. */
    this.rows = rows;

    /** @type {number} The current (0-based) column position of the cursor. */
    this.cursorCol = 0;

    /** @type {number} The current (0-based) row position of the cursor. */
    this.cursorRow = 0;

    /** @type {Color} The current foreground color. */
    this.colorFg = this.defaultFg = DIM_WHITE;

    /** @type {Color} The current background color. */
    this.colorBg = this.defaultBg = BLACK;

    /** @type {string} The current line of input being constructed. */
    this.input_ = '';

    /** @type {Promise} Set by input() and resolved when the user presses Enter. */
    this.inputDone_ = null;

    /** @type {number} Counter for the cursor blinker. */
    this.cursorBlink_ = BLINK_RATE;

    /** @type {boolean} Flag for the cursor blinker. */
    this.cursorOn_ = true;

    this.setDimensions_(cols, rows);
  }

  /**
   * @private
   * Allocates a new 2D array of Texels for the screen.
   * @return {Array.<Array.<Texel>>} The new array.
   */
  allocateScreen_() {
    let screen = [];
    for (let row = 0; row < this.rows; row++) {
      screen.push([]);
      for (let col = 0; col < this.cols; col++) {
        screen[row].push(new Texel(' ', this.colorFg, this.colorBg));
      }
    }
    return screen;
  }

  /**
   * Sets the background color.
   * @param {Color} color Background color to use.
   */
  bg(color) {
    if (color.val !== NONE.val) {
      this.colorBg = color;
    }
  }

  /** Clears the screen. */
  clear() {
    for (let row = 0; row < this.screen.length; row++) {
      for (let col = 0; col < this.screen[row].length; col++) {
        this.screen[row][col].update(' ', this.colorFg, this.colorBg);
      }
    }
    this.cursorRow = this.cursorCol = 0;
    document.getElementById('application').style.backgroundColor = this.colorBg.hex;
  }

  /**
   * @private
   * Moves the cursor one space to the left, going up a line if necessary.
   */
  cursorLeft_() {
    if (--this.cursorCol < 0) {
      this.cursorCol = this.cols - 1;
      if (--this.cursorRow < 0) {
        this.cursorRow = this.cursorCol = 0;
      }
    }
  }

  /** Draws the current state of the screen. */
  draw() {
    let gfx = document.getElementById('terminal').getContext('2d');
    gfx.font = FONT;
    gfx.textAlign = 'center';
    gfx.textBaseline = 'top';

    gfx.save();
    gfx.scale(this.xScale, this.yScale);

    // Draw each character.
    for (let row = this.rows - 1; row >= 0; row--) {
      for (let col = 0; col < this.cols; col++) {
        // Draw the background.
        gfx.fillStyle = this.screen[row][col].bg.hex;
        gfx.fillRect(CHAR_SIZE*col, CHAR_SIZE*row, CHAR_SIZE, CHAR_SIZE);

        // Draw the foreground.
        gfx.fillStyle = this.screen[row][col].fg.hex;
        gfx.fillText(this.screen[row][col].ch,
            CHAR_SIZE*col + HALF_SIZE, CHAR_SIZE*row);
      }
    }

    // Draw the cursor.
    if (this.cursorOn_) {
      gfx.fillStyle = this.colorFg.hex;
      gfx.fillRect(this.cursorCol * CHAR_SIZE,
          this.cursorRow * CHAR_SIZE, CHAR_SIZE, CHAR_SIZE);
    }
    if (--this.cursorBlink_ < 0) {
      this.cursorBlink_ = BLINK_RATE;
      this.cursorOn_ = !this.cursorOn_;
    }

    gfx.restore();
  }

  /**
   * Sets the foreground color.
   * @param {Color} color Foreground color to use.
   */
  fg(color) {
    if (color.val !== NONE.val) {
      this.colorFg = color;
    }
  }

  /**
   * Reads a full of line of input, with an optional prompt.
   * @param {string} prompt Prompt for the user.
   * @returns {Promise} The user input.
   */
  input(prompt = '') {
    this.output(prompt);
    this.input_ = '';
    return new Promise((resolve, ) => {
      this.inputDone_ = resolve;
    });
  }

  /**
   * @private
   * Moves the cursor to the first column of the next line, possibly triggering
   * a scroll.
   */
  newline_() {
    this.cursorCol = 0;
    if ((this.cursorRow + 1) >= this.rows) {
      this.scroll_();
    } else {
      this.cursorRow++;
    }
  }

  /**
   * Low-level output function.  This processes the input character by
   * character, interpreting embedded color codes such as {W} using the
   * embedded codes map.
   * @param {string} str The string to output.
   */
  output(str) {
    let inCode = false;
    let code = '';

    for (let ch of str) {
      if (inCode) {
        switch (ch) {
          case '{':
            this.outputChar_(ch);
            inCode = false;
            break;
          case '}':
            embeddedCodes[code]();
            [inCode, code] = [false, ''];
            break;
          default:
            code += ch;
        }
      } else if (ch === '{') {
        inCode = true;
      } else if (ch === '\n') {
        this.newline_();
      } else {
        this.outputChar_(ch);
      }
    }
  }

  /**
   * @private
   * Outputs a single character, moving the cursor and scrolling as needed.
   * @param {string} ch The character to output.
   */
  outputChar_(ch) {
    this.screen[this.cursorRow][this.cursorCol].update(ch, this.colorFg, this.colorBg);
    if (++this.cursorCol >= this.cols) {
      this.newline_();
    }
  }

  /** Resets foreground and background colors. */
  reset() {
    this.colorFg = this.defaultFg;
    this.colorBg = this.defaultBg;
  }

  /** Reverse video. */
  reverse() {
    [this.colorFg, this.colorBg] = [this.colorBg, this.colorFg];
  }

  /**
   * Responds to window resizing events by adjusting the scale and size of the
   * canvas.
   */
  resize() {
    console.log('Canvas Terminal resizing.');

    let canvas = document.getElementById('terminal');
    canvas.width = window.innerWidth - 10;
    canvas.height = window.innerHeight - 10;
    canvas.style.position = 'absolute';
    canvas.style.left = '5px';
    canvas.style.top = '5px';
    this.xScale = window.innerWidth / (CHAR_SIZE * (this.cols + 0.5));
    this.yScale = window.innerHeight / (CHAR_SIZE * (this.rows + 0.5));
    document.getElementById('application').style.backgroundColor = this.colorBg.hex;
  }

  /**
   * @private
   * Scrolls the screen one line, keeping the cursor where it is.
   */
  scroll_() {
    let top = this.screen[0];
    for (let row = 1; row < this.rows; row++) {
      this.screen[row - 1] = this.screen[row];
    }

    this.screen[this.rows - 1] = top;
    for (let col = 0; col < this.cols; col++) {
      this.screen[this.rows - 1][col].update(' ', this.colorFg, this.colorBg);
    }
  }

  /**
   * Sends one more keystroke to the screen device.
   * @param {number} key The character code to send.
   */
  send(key) {
    switch (key) {
      case 0x0d:
        // Enter: Submit a new line of text.
        this.newline_();
        let text = this.input_;
        this.input_ = '';
        this.inputDone_(text);
        break;

      case 0x08:
        // Backspace: Delete a character.
        if (this.input_.length) {
          this.cursorLeft_();
          this.screen[this.cursorRow][this.cursorCol].ch = ' ';
          this.input_ = this.input_.substr(0, this.input_.length - 1);
        }
        break;

      default:
        // Otherwise, type a new character.
        let ch = String.fromCharCode(key);
        this.screen[this.cursorRow][this.cursorCol].ch = ch;
        this.screen[this.cursorRow][this.cursorCol].fg = this.colorFg;
        this.screen[this.cursorRow][this.cursorCol].bg = this.colorBg;
        if (++this.cursorCol >= this.cols) {
          this.newline_();
        }
        this.input_ += ch;
    }
  }

  /**
   * @private
   * Sets new dimensions for the terminal, resetting its state.
   * @param {number} cols How many columns to support.
   * @param {number} rows How many rows to support.
   */
  setDimensions_(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.screen = this.allocateScreen_();
    this.cursorCol = this.cursorRow = 0;
    this.resize();
  }

  /**
   * Moves the cursor ahead to column |n|, wrapping if necessary.
   * @param {number} n The tab column.
   */
  tab(n) {
    if (this.cursorCol > n) {
      this.newline_();
    }
    while (this.cursorCol < Math.min(this.cols, n)) {
      this.output(' ');
    }
  }
}

//------------------------------------------------------------------------------

let term = new ConsoleTerm();

//------------------------------------------------------------------------------

/** @const */
module.exports = {
  // Externally visible names for the colors.
  'BLACK':       BLACK,
  'DIM_RED':     DIM_RED,
  'DIM_GREEN':   DIM_GREEN,
  'DIM_YELLOW':  DIM_YELLOW,
  'DIM_BLUE':    DIM_BLUE,
  'DIM_MAGENTA': DIM_MAGENTA,
  'DIM_CYAN':    DIM_CYAN,
  'DIM_WHITE':   DIM_WHITE,
  'GRAY':        GRAY,
  'RED':         RED,
  'GREEN':       GREEN,
  'YELLOW':      YELLOW,
  'BLUE':        BLUE,
  'MAGENTA':     MAGENTA,
  'CYAN':        CYAN,
  'WHITE':       WHITE,
  'NONE':        NONE,  // used to avoid changing color

  /**
   * Sets the current foreground color and (optionally) background color.
   * @param {Color} fg Foreground color.
   * @param {Color} bg Background color.
   */
  color(fg, bg = this.NONE) {
    term.fg(fg);
    term.bg(bg);
  },

  /** Resets to default colors. */
  reset: () => term.reset(),

  /** Clears the screen. */
  clear: () => term.clear(),

  /** Cursor control. */
  xy:    (x, y)  => term.xy(x, y),
  yx:    (y, x)  => term.xy(x, y),
  home:  ()      => term.home(),
  up:    (n = 1) => term.up(n),
  down:  (n = 1) => term.down(n),
  left:  (n = 1) => term.left(n),
  right: (n = 1) => term.right(n),

  /** Reverse video. */
  reverse:    () => term.reverse(true),
  reverseOff: () => term.reverse(false),

  /**
   * Prints a series of strings without a newline.
   * @param {string} strs The strings.
   */
  print(...strs) {
    for (let str of strs) {
      term.output(str);
    }
  },

  /**
   * Prints a series of strings with a newline.
   * @param {string} strs The strings.
   */
  println(...strs) {
    this.print.apply(null, strs);
    term.output('\n');
  },

  /**
   * Advances to horizontal cursor position |n| (0-based).  If the cursor
   * position is already past this point, wraps to the next line.
   * @param {number} n The tab column.
   */
  tab(n) {
    term.tab(n);
  },

  /** Stops and asks the user to press enter. */
  async delay() {
    this.println('{_}\n[Press Enter to continue.]');
    await this.input();
  },

  /**
   * Outputs an appropriate banner at the start of a game.
   * @param {string} source The book or magazine this game is from.
   * @param {string} title The title of the game.
   * @param {string} version The revision number of the game code.
   */
  hello(source, title, version) {
    this.clear();
    this.println(`{W}${title}`);
    this.println(`{G}Inspired by {R}${source}`);
    this.println(`{G}Node.js Version ${version} by {Y}Squunkin{_}`);
  },

  /**
   * Inputs a full line of text, with an optional prompt.
   * @param {string=} prompt The prompt.
   */
  async input(prompt = '') {
    return term.input(`{_}${prompt}{Y}`);
  },

  /**
   * Demands that the user enter 'y' or 'n' and converts it to a boolean.
   * @param {string=} prompt The prompt.
   * @returns {boolean}
   */
  async inputYN(prompt = '') {
    let value = '';
    while (value !== 'y' && value !== 'n') {
      value = await this.input(prompt);
    }
    return (value === 'y');
  },

  /**
   * Demands that the user enter a number in the range [min, max].
   * @param {string} prompt The prompt.
   * @param {number} min The minimum acceptable value.
   * @param {number} max The maximum acceptable value.
   * @returns {number}
   */
  async inputNumber(prompt, min, max) {
    let value = min - 1;
    while (value < min || value > max) {
      value = Number(await this.input(prompt));
    }
    return value;
  },

  /**
   * Substitutes CanvasTerm for the default ConsoleTerm and returns it to the
   * driver code.
   */
  canvas(cols=80, rows=25) {
    term = new CanvasTerm(cols, rows);
    return term;
  },
};
