// import 'package:flutter/material.dart';

// class ThemeProvider extends ChangeNotifier {
//   ThemeMode mode = ThemeMode.system;

//   bool get isDark =>
//       mode == ThemeMode.dark;

//   bool get isLight =>
//       mode == ThemeMode.light;

//   void setSystem() {
//     mode = ThemeMode.system;
//     notifyListeners();
//   }

//   void setDark() {
//     mode = ThemeMode.dark;
//     notifyListeners();
//   }

//   void setLight() {
//     mode = ThemeMode.light;
//     notifyListeners();
//   }

//   void toggleDarkLight() {
//     mode = (mode == ThemeMode.dark) ? ThemeMode.light : ThemeMode.dark;
//     notifyListeners();
//   }

//    void setMode(ThemeMode mode) {
//     mode = mode;
//     notifyListeners();
//   }
// }

import 'package:flutter/material.dart';

class ThemeProvider extends ChangeNotifier {
  ThemeMode _mode = ThemeMode.dark; // ou ThemeMode.dark si tu veux

  ThemeMode get mode => _mode;

  void toggleDarkLight() {
    _mode = (_mode == ThemeMode.dark) ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  // Optionnel: forcer un mode directement
  void setMode(ThemeMode mode) {
    _mode = mode;
    notifyListeners();
  }
}
