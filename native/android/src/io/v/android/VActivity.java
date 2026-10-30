package io.v.android;

import android.app.NativeActivity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Rect;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.inputmethod.BaseInputConnection;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;

import java.nio.charset.Charset;

// vab's activity plus text input and screen insets. sokol's Android backend
// drops key events and can't show the keyboard (the NDK call fails without a
// text view), so a hidden view here takes the keyboard's input and passes
// each character, and Backspace, Enter, Delete and the arrows, to native code
// (text_bridge.h). The native window covers the whole screen, under the
// status bar and the keyboard, so their sizes are passed on too. The app
// also asks whether the system is in dark mode, and hears when that changes.
public class VActivity extends NativeActivity {
	static { System.loadLibrary("v"); }
	private static VActivity thiz;
	// Set instance reference
	public VActivity() { thiz = this; }
	public static VActivity getVActivity() {
		return thiz;
	}

	// Keys other than characters, as text_bridge.h and platform_android.c.v
	// know them.
	static final int KEY_BACKSPACE = -1;
	static final int KEY_ENTER = -2;
	static final int KEY_DELETE = -3;
	static final int KEY_LEFT = -4;
	static final int KEY_RIGHT = -5;
	static final int KEY_BACK = -6;
	// The system switched between light and dark.
	static final int KEY_THEME = -7;

	// A character (code point) when code >= 0, else one of the keys above.
	static native void nativeKey(int code);
	// The pixels the system covers at the top and the bottom of the screen.
	static native void nativeInsets(int top, int bottom);

	private TextBridge bridge;
	private int insetTop = -1;
	private int insetBottom = -1;

	@Override
	protected void onCreate(Bundle state) {
		super.onCreate(state);
		bridge = new TextBridge(this);
		addContentView(bridge, new ViewGroup.LayoutParams(1, 1));
		final View decor = getWindow().getDecorView();
		decor.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
			public void onGlobalLayout() {
				// What is left of the window once the status bar, navigation
				// bar and keyboard have taken theirs.
				Rect visible = new Rect();
				decor.getWindowVisibleDisplayFrame(visible);
				int top = visible.top;
				int bottom = decor.getHeight() - visible.bottom;
				if (top != insetTop || bottom != insetBottom) {
					insetTop = top;
					insetBottom = bottom;
					nativeInsets(top, bottom);
				}
			}
		});
	}

	// The app goes back a screen, or on its first screen calls
	// moveTaskToBack. (sokol would end the app; see text_bridge.h.)
	@Override
	public void onBackPressed() {
		nativeKey(KEY_BACK);
	}

	// isNightMode is called from the native thread: whether the system is
	// in dark mode.
	public boolean isNightMode() {
		int night = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
		return night == Configuration.UI_MODE_NIGHT_YES;
	}

	@Override
	public void onConfigurationChanged(Configuration config) {
		super.onConfigurationChanged(config);
		nativeKey(KEY_THEME);
	}

	// showKeyboard is called from the native thread when a field gains or
	// loses focus. kind is gui.FieldKind; before is the field's text before
	// the cursor, in UTF-8.
	public void showKeyboard(final boolean show, final int kind, final byte[] before) {
		final String text = new String(before, Charset.forName("UTF-8"));
		runOnUiThread(new Runnable() {
			public void run() {
				InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
				if (imm == null) {
					return;
				}
				if (show) {
					bridge.start(kind, text);
					bridge.requestFocus();
					imm.restartInput(bridge);
					imm.showSoftInput(bridge, 0);
				} else {
					imm.hideSoftInputFromWindow(bridge.getWindowToken(), 0);
					bridge.clearFocus();
				}
			}
		});
	}

	static class TextBridge extends View {
		int kind;
		// The field's text before the cursor as the keyboard has seen it,
		// for its suggestions and capitals.
		final StringBuilder before = new StringBuilder();

		TextBridge(Context context) {
			super(context);
			setFocusable(true);
			setFocusableInTouchMode(true);
		}

		void start(int kind, String text) {
			this.kind = kind;
			before.setLength(0);
			before.append(text);
		}

		@Override
		public boolean onCheckIsTextEditor() {
			return true;
		}

		@Override
		public InputConnection onCreateInputConnection(EditorInfo out) {
			// gui.FieldKind: text, number, time, date, email, password, multiline.
			switch (kind) {
				case 1:
					out.inputType = InputType.TYPE_CLASS_NUMBER;
					break;
				case 2:
				case 3:
					out.inputType = InputType.TYPE_CLASS_DATETIME;
					break;
				case 4:
					out.inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS;
					break;
				case 5:
					out.inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD;
					break;
				case 6:
					out.inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
						| InputType.TYPE_TEXT_FLAG_CAP_SENTENCES;
					break;
				default:
					out.inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS;
			}
			out.imeOptions = EditorInfo.IME_FLAG_NO_FULLSCREEN | EditorInfo.IME_FLAG_NO_EXTRACT_UI
				| (kind == 6 ? EditorInfo.IME_ACTION_NONE : EditorInfo.IME_ACTION_DONE);
			out.initialSelStart = before.length();
			out.initialSelEnd = before.length();
			return new Connection(this);
		}
	}

	// Connection types into the field directly. A word the keyboard is still
	// composing is typed as it goes, and retyped when it changes.
	static class Connection extends BaseInputConnection {
		final TextBridge view;
		String composing = "";

		Connection(TextBridge view) {
			super(view, false);
			this.view = view;
		}

		void backspace(int n) {
			for (int i = 0; i < n; i++) {
				nativeKey(KEY_BACKSPACE);
				int len = view.before.length();
				if (len > 0) {
					int cut = Character.isLowSurrogate(view.before.charAt(len - 1)) && len > 1 ? 2 : 1;
					view.before.setLength(len - cut);
				}
			}
		}

		void type(CharSequence text) {
			String s = text.toString();
			for (int i = 0; i < s.length(); ) {
				int cp = s.codePointAt(i);
				nativeKey(cp == '\n' ? KEY_ENTER : cp);
				i += Character.charCount(cp);
			}
			view.before.append(s);
		}

		// replaceComposing swaps the word being composed for text.
		void replaceComposing(CharSequence text) {
			String s = text.toString();
			int same = 0;
			while (same < composing.length() && same < s.length() && composing.charAt(same) == s.charAt(same)) {
				same++;
			}
			if (same > 0 && Character.isHighSurrogate(s.charAt(same - 1))) {
				same--;
			}
			backspace(composing.codePointCount(same, composing.length()));
			type(s.substring(same));
		}

		@Override
		public boolean setComposingText(CharSequence text, int newCursorPosition) {
			replaceComposing(text);
			composing = text.toString();
			return true;
		}

		@Override
		public boolean commitText(CharSequence text, int newCursorPosition) {
			replaceComposing(text);
			composing = "";
			return true;
		}

		@Override
		public boolean finishComposingText() {
			composing = "";
			return true;
		}

		@Override
		public boolean deleteSurroundingText(int beforeLength, int afterLength) {
			finishComposingText();
			int n = view.before.length() < beforeLength ? view.before.length() : beforeLength;
			backspace(view.before.codePointCount(view.before.length() - n, view.before.length()));
			for (int i = 0; i < afterLength; i++) {
				nativeKey(KEY_DELETE);
			}
			return true;
		}

		@Override
		public boolean sendKeyEvent(KeyEvent event) {
			if (event.getAction() != KeyEvent.ACTION_DOWN) {
				return true;
			}
			switch (event.getKeyCode()) {
				case KeyEvent.KEYCODE_DEL:
					composing = "";
					backspace(1);
					return true;
				case KeyEvent.KEYCODE_FORWARD_DEL:
					nativeKey(KEY_DELETE);
					return true;
				case KeyEvent.KEYCODE_ENTER:
				case KeyEvent.KEYCODE_NUMPAD_ENTER:
					nativeKey(KEY_ENTER);
					return true;
				case KeyEvent.KEYCODE_DPAD_LEFT:
					nativeKey(KEY_LEFT);
					return true;
				case KeyEvent.KEYCODE_DPAD_RIGHT:
					nativeKey(KEY_RIGHT);
					return true;
			}
			int cp = event.getUnicodeChar();
			if (cp > 0) {
				type(new String(Character.toChars(cp)));
			}
			return true;
		}

		@Override
		public boolean performEditorAction(int action) {
			nativeKey(KEY_ENTER);
			return true;
		}

		@Override
		public CharSequence getTextBeforeCursor(int n, int flags) {
			int len = view.before.length();
			return view.before.substring(n < len ? len - n : 0);
		}

		@Override
		public CharSequence getTextAfterCursor(int n, int flags) {
			return "";
		}

		@Override
		public int getCursorCapsMode(int reqModes) {
			return android.text.TextUtils.getCapsMode(view.before, view.before.length(), reqModes);
		}
	}
}
