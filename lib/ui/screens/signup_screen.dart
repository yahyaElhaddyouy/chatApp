import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/session_provider.dart';
import '../widgets/auth_shell.dart';
import '../widgets/error_banner.dart';
import '../widgets/primary_button.dart';

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final nameC = TextEditingController();
  final emailC = TextEditingController();
  final passC = TextEditingController();
  bool loading = false;
  String? err;

  @override
  void dispose() {
    nameC.dispose();
    emailC.dispose();
    passC.dispose();
    super.dispose();
  }

  Future<void> _signup() async {
    setState(() { loading = true; err = null; });
    try {
      await context.read<SessionProvider>().signup(nameC.text, emailC.text, passC.text);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => err = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthShell(
      title: "Create account",
      subtitle: "Start chatting in less than a minute",
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              TextField(controller: nameC, decoration: const InputDecoration(labelText: "Name")),
              const SizedBox(height: 12),
              TextField(
                controller: emailC,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: "Email"),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: passC,
                obscureText: true,
                decoration: const InputDecoration(labelText: "Password"),
              ),
              const SizedBox(height: 14),
              if (err != null) ...[
                ErrorBanner(text: err!),
                const SizedBox(height: 12),
              ],
              PrimaryButton(text: "Create account", loading: loading, onPressed: _signup),
            ],
          ),
        ),
      ),
    );
  }
}
