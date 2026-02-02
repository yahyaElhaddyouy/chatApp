import 'dart:async';
import 'package:chat_app_cloud/ui/screens/chat_screen.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/chat_service.dart';
import '../../services/appwrite_client.dart';
import '../../config/environment.dart';
import '../../state/theme_provider.dart';


class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  final chatService = ChatService();

  List<Map<String, dynamic>> conversations = [];
  bool loading = false;

  StreamSubscription? _realtimeSub;

  /* ================= TIME FORMAT ================= */
  String _formatTime(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final dt = DateTime.parse(iso).toLocal();
    return "${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}";
  }

  /* ================= LOAD ================= */
  Future<void> _loadConversations() async {
    setState(() => loading = true);

    final res = await chatService.listConversations();

    setState(() => loading = false);

    if (res['ok'] == true) {
      conversations =
          (res['conversations'] as List).cast<Map<String, dynamic>>();
      setState(() {});
    } else {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['error'] ?? 'Failed to load chats')),
      );
    }
  }

  /* ================= REALTIME ================= */
  void _subscribeRealtime() {
    _realtimeSub = AppwriteClient.realtime
        .subscribe([
          // New message / delivered / read
          'databases.${Environment.databaseId}.collections.messages.documents',
          // lastReadAt updated
          'databases.${Environment.databaseId}.collections.memberships.documents',
          // lastMessage updated
          'databases.${Environment.databaseId}.collections.conversations.documents',
        ])
        .stream
        .listen((_) async {
          // SAFE & SIMPLE: reload conversations
          await _loadConversations();
        });
  }

  /* ================= INIT ================= */
  @override
  void initState() {
    super.initState();
    _loadConversations();
    _subscribeRealtime();
  }

  /* ================= CLEANUP ================= */
  @override
  void dispose() {
    _realtimeSub?.cancel();
    super.dispose();
  }

  /* ================= OPEN CHAT ================= */
  Future<void> _openChat(String conversationId) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatScreen(conversationId: conversationId),
      ),
    );

    // Safety refresh after return
    await _loadConversations();
  }

  /* ================= UI ================= */
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Chats"),
        actions: [
          IconButton(
            tooltip: "Toggle theme",
            onPressed: () => context.read<ThemeProvider>().toggleDarkLight(),
            icon: Icon(
              context.watch<ThemeProvider>().mode == ThemeMode.dark
                  ? Icons.light_mode
                  : Icons.dark_mode,
            ),
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : conversations.isEmpty
              ? const Center(child: Text("No chats yet. Create a DM above."))
              : ListView.builder(
                  itemCount: conversations.length,
                  itemBuilder: (context, index) {
                    final convo = conversations[index];
                    final unread = convo['unreadCount'] ?? 0;

                    return ListTile(
                      title: Text(convo['title'] ?? 'DM'),
                      subtitle: Text(
                        convo['lastMessageText'] ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),

                      /* ===== RIGHT SIDE (TIME + BADGE) ===== */
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          // ⏱ DeliveredAt / Last message time
                          Text(
                            _formatTime(convo['lastMessageAt']),
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                          const SizedBox(height: 6),

                          // 🔴 New message badge
                          if (unread > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: const Color.fromARGB(255, 9, 248, 177),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                unread.toString(),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                        ],
                      ),

                      onTap: () => _openChat(convo['\$id']),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // ton UI existant pour créer un DM
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}
