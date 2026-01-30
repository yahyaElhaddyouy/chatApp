import 'package:flutter/material.dart';
import '../appwrite/auth_service.dart';

class AuthTestScreen extends StatefulWidget {
  const AuthTestScreen({super.key});

  @override
  State<AuthTestScreen> createState() => _AuthTestScreenState();
}

class _AuthTestScreenState extends State<AuthTestScreen> {
  final auth = AuthService();

  final nameC = TextEditingController(text: "User");
  final emailC = TextEditingController();
  final passC = TextEditingController();

  String status = "Ready";
  bool busy = false;

  Future<void> run(Future<void> Function() fn) async {
    setState(() {
      busy = true;
      status = "Working...";
    });
    try {
      await fn();
      setState(() => status = "OK");
    } catch (e) {
      setState(() => status = "ERROR: $e");
    } finally {
      setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    nameC.dispose();
    emailC.dispose();
    passC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Appwrite Auth Test")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: nameC,
              decoration: const InputDecoration(labelText: "Name (signup)"),
            ),
            TextField(
              controller: emailC,
              decoration: const InputDecoration(labelText: "Email"),
            ),
            TextField(
              controller: passC,
              decoration: const InputDecoration(labelText: "Password"),
              obscureText: true,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: busy
                        ? null
                        : () => run(() async {
                              await auth.signup(
                                name: nameC.text.trim(),
                                email: emailC.text.trim(),
                                password: passC.text,
                              );
                            }),
                    child: const Text("SIGN UP"),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton(
                    onPressed: busy
                        ? null
                        : () => run(() async {
                              await auth.login(
                                email: emailC.text.trim(),
                                password: passC.text,
                              );
                            }),
                    child: const Text("LOGIN"),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy
                        ? null
                        : () => run(() async {
                              final me = await auth.me();
                              setState(() => status =
                                  "ME: ${me.name} | ${me.email} | id=${me.$id}");
                            }),
                    child: const Text("ME"),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy
                        ? null
                        : () => run(() async {
                              await auth.logout();
                            }),
                    child: const Text("LOGOUT"),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            SelectableText(status),
          ],
        ),
      ),
    );
  }
}
