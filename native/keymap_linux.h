// sokol maps X11 keys by their physical position (XKB key names), so a key
// the keymap remaps -- Caps Lock and Escape swapped with caps:swapescape, or
// Caps Lock as another Control -- still reports what is printed on it.
// weight_x11_respect_keymap fixes sokol's table for the keys that don't type
// text: each key reports what the keymap makes it. Letters, digits and
// punctuation keep sokol's position-based codes. (As ../soccer/native's.)
//
// It reaches into sokol_app.h's private state (_sapp), so it must be included
// after sokol's implementation; call it once sokol is running (init_cb). A
// native Wayland build (-d sokol_wayland) has no X11 state, and does nothing.
#if defined(_SAPP_X11)
#include <X11/XKBlib.h>
#include <X11/keysym.h>

void weight_x11_respect_keymap(void) {
  Display *display = _sapp.x11.display;
  if (display == NULL) {
    return;
  }
  static const struct {
    KeySym sym;
    sapp_keycode key;
  } keys[] = {
      {XK_Escape, SAPP_KEYCODE_ESCAPE},
      {XK_Caps_Lock, SAPP_KEYCODE_CAPS_LOCK},
      {XK_Tab, SAPP_KEYCODE_TAB},
      {XK_BackSpace, SAPP_KEYCODE_BACKSPACE},
      {XK_Return, SAPP_KEYCODE_ENTER},
      {XK_Delete, SAPP_KEYCODE_DELETE},
      {XK_Control_L, SAPP_KEYCODE_LEFT_CONTROL},
      {XK_Control_R, SAPP_KEYCODE_RIGHT_CONTROL},
      {XK_Shift_L, SAPP_KEYCODE_LEFT_SHIFT},
      {XK_Shift_R, SAPP_KEYCODE_RIGHT_SHIFT},
      {XK_Alt_L, SAPP_KEYCODE_LEFT_ALT},
      {XK_Alt_R, SAPP_KEYCODE_RIGHT_ALT},
      {XK_Super_L, SAPP_KEYCODE_LEFT_SUPER},
      {XK_Super_R, SAPP_KEYCODE_RIGHT_SUPER},
  };
  const int n = (int)(sizeof(keys) / sizeof(keys[0]));
  for (int code = 8; code < _SAPP_X11_MAX_X11_KEYCODES; code++) {
    KeySym sym = XkbKeycodeToKeysym(display, (KeyCode)code, 0, 0);
    if (sym == NoSymbol) {
      continue;
    }
    for (int i = 0; i < n; i++) {
      if (keys[i].sym == sym) {
        _sapp.keycodes[code] = keys[i].key;
        break;
      }
    }
  }
}
#else
void weight_x11_respect_keymap(void) {}
#endif
