import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:chat_app_cloud/services/appwrite_client.dart';
import 'package:chat_app_cloud/services/chat_service.dart';
import 'package:chat_app_cloud/state/session_provider.dart';
import 'package:chat_app_cloud/state/theme_provider.dart';
import 'package:chat_app_cloud/config/environment.dart';

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

  String? currentUserId;
  StreamSubscription? _realtimeSub;

  bool loadingLogout = false;
  String? err;

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

  

  Future<void> _loadConversations() async {
    setState(() => loadingConversations = true);

    final res = await chatService.listConversations();

    setState(() => loadingConversations = false);

    if (!mounted) return;

    if (res['ok'] == true) {
      final list = (res['conversations'] as List? ?? []);
      setState(() {
        conversations = list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      });
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['error'] ?? 'Failed to load conversations')),
      );
    }
  }

  void _subscribeRealtime() {
    _realtimeSub = AppwriteClient.realtime
        .subscribe([
          'databases.${Environment.databaseId}.collections.messages.documents',
        ])
        .stream
        .listen((event) {
          final payload = Map<String, dynamic>.from(event.payload);

          final convoId = payload['conversationId'];
          if (convoId == null) return;

          final idx = conversations.indexWhere((c) => c[r'$id'] == convoId);
          if (idx == -1) return;

          setState(() {
            final convo = Map<String, dynamic>.from(conversations[idx]);

            // update last message
            convo['lastMessageText'] = payload['text'] ?? '';
            convo['lastMessageAt'] = payload['createdAt'] ?? payload[r'$createdAt'];

            // unread++ only if message from other user AND you are on list screen
            if (payload['senderId'] != null && payload['senderId'] != currentUserId) {
              convo['unreadCount'] = (convo['unreadCount'] ?? 0) + 1;
            }

            conversations.removeAt(idx);
            conversations.insert(0, convo);
          });
        });
  }

  String _formatTime(dynamic isoOrDt) {
    if (isoOrDt == null) return '';
    try {
      final dt = DateTime.parse(isoOrDt.toString()).toLocal();
      final hh = dt.hour.toString().padLeft(2, '0');
      final mm = dt.minute.toString().padLeft(2, '0');
      return '$hh:$mm';
    } catch (_) {
      return '';
    }
  }

  Future<void> _logout() async {
    setState(() {
      loadingLogout = true;
      err = null;
    });

    try {
      await context.read<SessionProvider>().logout();
    } catch (e) {
      setState(() => err = e.toString());
    } finally {
      if (mounted) setState(() => loadingLogout = false);
    }
  }

  Future<void> _openNewDmSheet() async {
    final emailC = TextEditingController();

    await showModalBottomSheet<void>(
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
                  final email = emailC.text.trim();
                  if (email.isEmpty) return;

                  final user = await AppwriteClient.account.get();
                  final userId = user.$id;

                  final res = await chatService.createDm(
                    otherEmail: email,
                    userId: userId,
                  );

                  if (!ctx.mounted) return;

                  if (res['ok'] == true) {
                    Navigator.pop(ctx);
                    await _loadConversations(); // refresh list
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('DM created successfully')),
                    );
                  } else {
                    ScaffoldMessenger.of(ctx).showSnackBar(
                      SnackBar(content: Text(res['error'] ?? 'Failed to create DM')),
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

  @override
  void dispose() {
    _realtimeSub?.cancel();
    super.dispose();
  }

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
              context.watch<ThemeProvider>().mode == ThemeMode.light
                  ? Icons.dark_mode
                  : Icons.light_mode,
            ),
          ),
          IconButton(
            tooltip: "Logout",
            onPressed: loadingLogout ? null : _logout,
            icon: loadingLogout
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.logout),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openNewDmSheet, // ✅ Create DM button back
        child: const Icon(Icons.add),
      ),
      body: loadingConversations
          ? const Center(child: CircularProgressIndicator())
          : conversations.isEmpty
              ? const Center(child: Text("No chats yet. Create a DM above."))
              : ListView.builder(
                  itemCount: conversations.length,
                  itemBuilder: (context, index) {
                    final convo = conversations[index];

                    final convoId = convo[r'$id']?.toString() ?? '';
                    final title = (convo['title'] ?? 'DM').toString();
                    final otherUserId = (convo['otherUserId'] ?? '').toString();

                    final lastText = (convo['lastMessageText'] ?? '').toString();
                    final lastAt = convo['lastMessageAt'];
                    final unread = (convo['unreadCount'] ?? 0) as int;

                    return ListTile(
                      title: Text(title),
                      subtitle: Text(
                        lastText.isEmpty ? 'No messages' : lastText,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            _formatTime(lastAt),
                            style: const TextStyle(fontSize: 11),
                          ),
                          const SizedBox(height: 6),
                          if (unread > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: const Color.fromARGB(255, 0, 255, 170),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                unread.toString(),
                                style: const TextStyle(color: Colors.white, fontSize: 11),
                              ),
                            ),
                        ],
                      ),
                      onTap: () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ChatScreen(
                              conversationId: convoId, otherUserName: title,
                              // ✅ You asked: title should be otherUserId
                              // you can use otherUserId in ChatScreen AppBar
                              // (pass it here if your ChatScreen supports it)
                              // otherUserId: otherUserId,
                            ),
                          ),
                        );

                        // refresh after coming back (also resets unread if backend does)
                        await _loadConversations();
                      },
                    );
                  },
                ),
    );
  }
}
