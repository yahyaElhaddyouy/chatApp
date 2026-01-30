import 'package:flutter/material.dart';
import '../appwrite/auth_service.dart';
import '../appwrite/chat_service.dart';

class DmTestScreen extends StatefulWidget {
  const DmTestScreen({super.key});

  @override
  State<DmTestScreen> createState() => _DmTestScreenState();
}

class _DmTestScreenState extends State<DmTestScreen> {
  final auth = AuthService();
  final chat = ChatService();

  final emailC = TextEditingController();
  final passC = TextEditingController();
  final otherEmailC = TextEditingController();

  String status = "Ready";
  bool loading = false;

  Future<void> _run(Future<void> Function() fn) async {
    setState(() {
      loading = true;
      status = "Working...";
    });
    try {
      await fn();
    } catch (e) {
      setState(() => status = "ERROR: $e");
    } finally {
      setState(() => loading = false);
    }
  }

  @override
  void dispose() {
    emailC.dispose();
    passC.dispose();
    otherEmailC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("DM Test (Appwrite)")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            const Text("1) Login"),
            const SizedBox(height: 8),
            TextField(
              controller: emailC,
              decoration: const InputDecoration(labelText: "Email"),
            ),
            TextField(
              controller: passC,
              decoration: const InputDecoration(labelText: "Password"),
              obscureText: true,
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: loading
                  ? null
                  : () => _run(() async {
                        await auth.login(
                          email: emailC.text.trim(),
                          password: passC.text,
                        );
                        final me = await auth.me();
                        setState(() => status = "Logged in as ${me.email} (id=${me.$id})");
                      }),
              child: const Text("LOGIN"),
            ),
            const Divider(height: 32),
            const Text("2) Create DM (by other user's email)"),
            const SizedBox(height: 8),
            TextField(
              controller: otherEmailC,
              decoration: const InputDecoration(labelText: "Other user email"),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: loading
                  ? null
                  : () => _run(() async {
                        final res = await chat.createDm(otherEmail: otherEmailC.text.trim());
                        setState(() => status = "createDm response:\n$res");
                      }),
              child: const Text("CREATE DM"),
            ),
            const SizedBox(height: 16),
            SelectableText(status),
          ],
        ),
      ),
    );
  }
}
