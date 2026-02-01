import 'package:appwrite/appwrite.dart';
import 'package:chat_app_cloud/services/appwrite_client.dart';
import 'package:chat_app_cloud/state/session_provider.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/chat_service.dart';
import '../../state/theme_provider.dart';
import 'chat_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  final chatService = ChatService();

  List<Map<String, dynamic>> conversations = [];
  bool loadingConversations = false;

  bool loading = false;
  String? err;

  // ================= INIT =================
  @override
  void initState() {
    super.initState();
    _loadConversations();
  }

  // ================= LOAD CONVERSATIONS =================
  Future<void> _loadConversations() async {
    if (!mounted) return;

    setState(() => loadingConversations = true);

    final res = await chatService.listConversations();

    if (!mounted) return;

    setState(() => loadingConversations = false);

    if (res['ok'] == true) {
      final list = (res['conversations'] as List)
          .map((e) => e as Map<String, dynamic>)
          .toList();

      setState(() => conversations = list);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['error'] ?? 'Failed to load conversations')),
      );
    }
  }

  // ================= LOGOUT =================
  Future<void> _logout() async {
    setState(() {
      loading = true;
      err = null;
    });

    try {
      await context.read<SessionProvider>().logout();
    } catch (e) {
      if (mounted) setState(() => err = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  // ================= CREATE DM =================
  Future<void> _openNewDmSheet() async {
    final emailC = TextEditingController();

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 12,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                "New DM",
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: emailC,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: "Enter email"),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () async {
                  if (emailC.text.trim().isEmpty) return;

                  final user = await AppwriteClient.account.get();
                  final userId = user.$id;

                  final res = await chatService.createDm(
                    otherEmail: emailC.text.trim(),
                    userId: userId,
                  );

                  if (!mounted) return;

                  if (res['ok'] == true) {
                    Navigator.pop(ctx);

                    // 🔥 RAFRAÎCHIS LA LISTE
                    await _loadConversations();
                  } else {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(
                        content:
                            Text(res['error'] ?? 'Failed to create DM'),
                      ),
                    );
                  }
                },
                child: const Text("Create DM"),
              ),
            ],
          ),
        );
      },
    );
  }

  // ================= UI =================
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Chats"),
        actions: [
          IconButton(
            tooltip: "Toggle theme",
            onPressed: () =>
                context.read<ThemeProvider>().toggleDarkLight(),
            icon: Icon(
              context.watch<ThemeProvider>().mode == ThemeMode.dark
                  ? Icons.light_mode
                  : Icons.dark_mode,
            ),
          ),
          IconButton(
            onPressed: _logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openNewDmSheet,
        child: const Icon(Icons.add),
      ),
      body: loadingConversations
          ? const Center(child: CircularProgressIndicator())
          : conversations.isEmpty
              ? const Center(
                  child: Text("No chats yet. Create a DM above."),
                )
              : ListView.builder(
                  itemCount: conversations.length,
                  itemBuilder: (context, index) {
                    final c = conversations[index];

                    return ListTile(
                      title: Text(c['title'] ?? 'DM'),
                      subtitle:
                          Text(c['lastMessageText'] ?? 'No messages'),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                ChatScreen(conversationId: c['\$id']),
                          ),
                        );
                      },
                    );
                  },
                ),
    );
  }
}
