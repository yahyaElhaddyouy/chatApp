import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../state/session_provider.dart';
import '../widgets/primary_button.dart';
import '../widgets/text_field_x.dart';
import 'signup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailC = TextEditingController();
  final passC = TextEditingController();
  bool loading = false;
  String? err;

  @override
  void dispose() {
    emailC.dispose();
    passC.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() { loading = true; err = null; });
    try {
      await context.read<SessionProvider>().login(emailC.text, passC.text);
    } catch (e) {
      setState(() => err = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextFieldX(controller: emailC, label: 'Email', keyboardType: TextInputType.emailAddress),
            const SizedBox(height: 12),
            TextFieldX(controller: passC, label: 'Password', obscure: true),
            const SizedBox(height: 12),
            if (err != null) Text(err!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 12),
            PrimaryButton(text: loading ? 'Loading...' : 'Login', onPressed: loading ? null : _login),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignupScreen())),
              child: const Text("Create an account"),
            ),
          ],
        ),
      ),
    );
  }
}
