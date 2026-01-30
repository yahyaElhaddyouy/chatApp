import 'package:flutter/material.dart';
import 'screens/auth_test_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'ndwiwi binatna',
      theme: ThemeData(useMaterial3: true),
      home: const AuthTestScreen(),
    );
  }
}