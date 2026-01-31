import 'package:flutter/foundation.dart';
import 'package:appwrite/models.dart';
import '../services/auth_service.dart';

class SessionProvider extends ChangeNotifier {
  final AuthService _auth;

  SessionProvider(this._auth);

  User? user;
  bool loading = true;

  Future<void> bootstrap() async {
    loading = true;
    notifyListeners();
    try {
      user = await _auth.currentUser();
    } catch (_) {
      user = null;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> login(String email, String password) async {
    await _auth.login(email: email, password: password);
    await bootstrap();
  }

  Future<void> signup(String name, String email, String password) async {
    await _auth.signup(name: name, email: email, password: password);
    await _auth.login(email: email, password: password);
    await bootstrap();
  }

  Future<void> logout() async {
    await _auth.logout();
    await bootstrap();
  }
}
