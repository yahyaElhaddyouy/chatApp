import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/chat_service.dart';
import '../../services/appwrite_client.dart';
import '../../config/environment.dart';
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
  bool loading = false;

  StreamSubscription? _realtimeSub;
  String? currentUserId;

  /* ================= INIT ================= */
  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final user = await AppwriteClient.account.get();
    currentUserId = user.$id;

    await _loadConversations();
    _subscribeRealtime();
  }

  /* ================= LOAD ================= */
  Future<void> _loadConversations() async {
    setState(() => loading = true);

    final res = await chatService.listConversations();

    setState(() => loading = false);

    if (res['ok'] == true) {
      setState(() {
        conversations =
            (res['conversations'] as List).cast<Map<String, dynamic>>();
      });
    }
  }

  /* ================= REALTIME ================= */
  void _subscribeRealtime() {
    _realtimeSub = AppwriteClient.realtime
        .subscribe([
          'databases.${Environment.databaseId}.collections.messages.documents'
        ])
        .stream
        .listen((event) {
          final payload = Map<String, dynamic>.from(event.payload);

          final convoId = payload['conversationId'];
          if (convoId == null) return;

          final index =
              conversations.indexWhere((c) => c['\$id'] == convoId);
          if (index == -1) return;

          setState(() {
            final convo = conversations[index];

            // 🔴 incrément unread seulement si message reçu
            if (payload['senderId'] != currentUserId) {
              convo['unreadCount'] = (convo['unreadCount'] ?? 0) + 1;
            }

            convo['lastMessageText'] = payload['text'];
            convo['lastMessageAt'] = payload['createdAt'];

            // remonter la conversation
            conversations.removeAt(index);
            conversations.insert(0, convo);
          });
        });
  }

  /* ================= FORMAT ================= */
  String _formatTime(String? iso) {
    if (iso == null) return '';
    final dt = DateTime.parse(iso).toLocal();
    return "${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}";
  }

  /* ================= CLEANUP ================= */
  @override
  void dispose() {
    _realtimeSub?.cancel();
    super.dispose();
  }

  /* ================= UI ================= */
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chats'),
        actions: [
          IconButton(
            onPressed: () =>
                context.read<ThemeProvider>().toggleDarkLight(),
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
          : ListView.builder(
              itemCount: conversations.length,
              itemBuilder: (context, index) {
                final convo = conversations[index];
                final unread = convo['unreadCount'] ?? 0;

                return ListTile(
                  onTap: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            ChatScreen(conversationId: convo['\$id']),
                      ),
                    );

                    // 🔄 refresh après retour
                    await _loadConversations();
                  },
                  title: Text(convo['title'] ?? 'DM'),
                  subtitle: Text(
                    convo['lastMessageText'] ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _formatTime(convo['lastMessageAt']),
                        style: const TextStyle(fontSize: 11),
                      ),
                      const SizedBox(height: 6),
                      if (unread > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.red,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            unread.toString(),
                            style: const TextStyle(
                                color: Colors.white, fontSize: 11),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
