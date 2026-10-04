'use strict';

/**
 * Which elements should keep their own keystrokes.
 *
 * The app installs one global keydown handler that drives the calculator
 * keypad. Without a guard it also ran while the user was typing into a field,
 * which caused two real bugs:
 *
 *   - '=' was routed to calc.equals() *and* preventDefault() was called, so the
 *     character never reached the input. An equation such as x^2-5x+6=0 could
 *     not be typed into the symbolic solver at all.
 *   - Digits and operators typed into any field still reached the calculator,
 *     silently changing the answer behind the panel.
 *
 * This module holds the decision so it can be unit tested. The bug survived a
 * large test suite because every test set input.value programmatically and
 * never dispatched a key.
 */
(function (global) {

  /** Input types where the user is genuinely entering text. */
  const TEXT_INPUT_TYPES = [
    'text', 'number', 'search', 'email', 'url', 'tel', 'password',
  ];

  /**
   * True when the event target is a field that owns its keystrokes.
   *
   * Deliberately excludes range, colour, checkbox, radio, file and button:
   * for those the browser owns the interaction and its arrow/space keys must
   * keep working. Buttons are excluded so that clicking a toolbar button and
   * then typing still reaches the calculator.
   */
  function isTextEntry(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;

    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'select') return true;
    if (tag !== 'input') return false;

    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return TEXT_INPUT_TYPES.indexOf(type) !== -1;
  }

  /**
   * Whether the global keypad handler should stand down for this event.
   *
   * Escape is the one exception worth keeping global, because it means "back
   * out" wherever you are.
   */
  function shouldDeferToField(target, key) {
    if (!isTextEntry(target)) return false;
    return key !== 'Escape';
  }

  const KeyboardTarget = {
    TEXT_INPUT_TYPES: TEXT_INPUT_TYPES,
    isTextEntry: isTextEntry,
    shouldDeferToField: shouldDeferToField,
  };

  global.KeyboardTarget = KeyboardTarget;
  if (typeof module !== 'undefined' && module.exports) module.exports = KeyboardTarget;
})(typeof self !== 'undefined' ? self : globalThis);
