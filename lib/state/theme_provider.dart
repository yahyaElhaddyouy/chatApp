import 'package:flutter/material.dart';

class ThemeProvider extends ChangeNotifier {
  ThemeMode mode = ThemeMode.system;

  bool get isDark =>
      mode == ThemeMode.dark;

  bool get isLight =>
      mode == ThemeMode.light;

  void setSystem() {
    mode = ThemeMode.system;
    notifyListeners();
  }

  void setDark() {
    mode = ThemeMode.dark;
    notifyListeners();
  }

  void setLight() {
    mode = ThemeMode.light;
    notifyListeners();
  }

  void toggleDarkLight() {
    mode = (mode == ThemeMode.dark) ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }
}
