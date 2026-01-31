import 'package:flutter/material.dart';

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    // ✅ FIX: replace withOpacity(...) (deprecated) with withValues(alpha: ...)
    final bg = cs.primary.withValues(alpha: 0.12);
    final border = cs.primary.withValues(alpha: 0.18);
    final barBg = cs.primary.withValues(alpha: 0.10);

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final subColor = isDark ? Colors.white70 : Colors.black54;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: border),
                  ),
                  child: const Text(
                    "🐧",
                    style: TextStyle(fontSize: 44),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  "Loading...",
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  "Preparing your chats",
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: subColor,
                      ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: 220,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      minHeight: 8,
                      backgroundColor: barBg,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
