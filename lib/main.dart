import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'services/auth_service.dart';
import 'state/session_provider.dart';
import 'state/theme_provider.dart';
import 'ui/theme.dart';

import 'ui/screens/loading_screen.dart';
import 'ui/screens/login_screen.dart';
import 'ui/screens/chat_list_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(
          create: (_) => SessionProvider(AuthService())..bootstrap(),
        ),
      ],
      child: const App(),
    ),
  );
}

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final theme = context.watch<ThemeProvider>();

    // ✅ Loading screen with the SAME theme (dark/light) + penguin
    if (session.loading) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'DM Test',
        theme: ThemeData.light(),
          darkTheme: ThemeData.dark(),
          themeMode: theme.mode, // ✅ l’app écoute le mode ici
        home: const LoadingScreen(),
      );
    }

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'DM Test',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: theme.mode,
      home: session.user == null ? const LoginScreen() : const ChatListScreen(),
    );
  }
}
