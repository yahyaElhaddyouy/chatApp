import 'dart:async';
import 'package:chat_app_cloud/state/theme_provider.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/chat_service.dart';
import '../../services/appwrite_client.dart';
import '../../config/environment.dart';

class ChatScreen extends StatefulWidget {
  final String conversationId;
  const ChatScreen({super.key, required this.conversationId});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final chatService = ChatService();
  final msgController = TextEditingController();

  List<Map<String, dynamic>> messages = [];
  bool loadingMessages = false;

  String? currentUserId;
  StreamSubscription? _realtimeSub;

  /* ================= MESSAGE STATUS ================= */
  Widget _buildStatus(Map<String, dynamic> msg) {
    if (msg['senderId'] != currentUserId) {
      return const SizedBox(); // seulement pour mes messages
    }

    final status = msg['status'];

    switch (status) {
      case 'sent':
        return const Text('✓', style: TextStyle(fontSize: 10));
      case 'delivered':
        return const Text('✓✓', style: TextStyle(fontSize: 10));
      case 'read':
        return const Text('✓✓ Seen', style: TextStyle(fontSize: 10));
      case 'sending':
        return const Text('…', style: TextStyle(fontSize: 10));
      default:
        return const SizedBox();
    }
  }

  /* ================= LOAD MESSAGES ================= */
  Future<void> _loadMessages() async {
    setState(() => loadingMessages = true);

    final res =
        await chatService.listMessages(conversationId: widget.conversationId);

    setState(() => loadingMessages = false);

    if (res['ok'] == true) {
      final list = res['messages'] as List;
      setState(() {
        //msgController.clear();
        messages = list.map((e) => e as Map<String, dynamic>).toList();
      });

      // Mark messages as read when opening the chat
      await chatService.markConversationRead(widget.conversationId);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['error'] ?? 'Failed to load messages')),
      );
    }
  }

  /* ================= REALTIME ================= */
  // void _subscribeRealtime() {
  //   _realtimeSub = AppwriteClient.realtime
  //       .subscribe([
  //         'databases.${Environment.databaseId}.collections.messages.documents'
  //       ])
  //       .stream
  //       .listen((event) {
  //         final payload = Map<String, dynamic>.from(event.payload);

  //         if (payload['conversationId'] != widget.conversationId) return;

  //         setState(() {
  //           // 1️⃣ Cherche un message local équivalent (same text + sender)
  //           final localIndex = messages.indexWhere((m) =>
  //               m['isLocal'] == true &&
  //               m['text'] == payload['text'] &&
  //               m['senderId'] == payload['senderId']);

  //           if (localIndex != -1) {
  //             // 🔁 REMPLACE l’optimistic par le vrai message backend
  //             messages[localIndex] = payload;
  //             return;
  //           }

  //           // 2️⃣ Sinon : UPDATE d’un message existant
  //           final index =
  //               messages.indexWhere((m) => m['\$id'] == payload['\$id']);

  //           if (index != -1) {
  //             messages[index] = payload;
  //             return;
  //           }

  //           // 3️⃣ Sinon : NOUVEAU message (reçu de l’autre user)
  //           messages.insert(0, payload);
  //         });
  //       });
  // }

  void _subscribeRealtime() {
  _realtimeSub = AppwriteClient.realtime
      .subscribe([
        'databases.${Environment.databaseId}.collections.messages.documents'
      ])
      .stream
      .listen((event) {
        final payload = Map<String, dynamic>.from(event.payload);

        // ⛔ Ignore les autres conversations
        if (payload['conversationId'] != widget.conversationId) return;

        setState(() {
          // 1️⃣ UPDATE : message existe déjà → on met à jour le statut
          final index =
              messages.indexWhere((m) => m['\$id'] == payload['\$id']);

          if (index != -1) {
            messages[index] = payload; // ✅ ICI le status change
            return;
          }

          // 2️⃣ INSERT : message reçu de l’autre utilisateur
          messages.insert(0, payload);
        });
      });
}


  /* ================= INIT ================= */
  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final user = await AppwriteClient.account.get();
    currentUserId = user.$id;
    await _loadMessages();
    await chatService.markConversationDelivered(widget.conversationId);
    await chatService.markConversationRead(widget.conversationId);
    _subscribeRealtime();
  }

  /* ================= CLEANUP ================= */
  @override
  void dispose() {
    _realtimeSub?.cancel();
    msgController.dispose();
    super.dispose();
  }

  /* ================= SEND MESSAGE ================= */
  Future<void> _sendMessage() async {
    final text = msgController.text.trim();
    if (text.isEmpty || currentUserId == null) return;

    msgController.clear();

    // Optimistic UI
    final optimisticMsg = {
      '\$id': 'local-${DateTime.now().millisecondsSinceEpoch}',
      'text': text,
      'senderId': currentUserId,
      'conversationId': widget.conversationId,
      'createdAt': DateTime.now().toIso8601String(),
      'status': 'sending',
      'isLocal': true,
    };

    setState(() => messages.insert(0, optimisticMsg));

    final res = await chatService.sendMessage(
      conversationId: widget.conversationId,
      text: text,
    );

    if (res['ok'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['error'] ?? 'Failed to send message')),
      );
    }
  }

  /* ================= UI ================= */
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Chat"),
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
      body: Column(
        children: [
          Expanded(
            child: loadingMessages
                ? const Center(child: CircularProgressIndicator())
                : messages.isEmpty
                    ? const Center(child: Text("No messages yet"))
                    : ListView.builder(
                        reverse: true,
                        itemCount: messages.length,
                        itemBuilder: (context, index) {
                          final msg = messages[index];
                          final isMe = msg['senderId'] == currentUserId;

                          return Align(
                            alignment: isMe
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.symmetric(
                                  vertical: 6, horizontal: 12),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 10),
                              constraints: const BoxConstraints(maxWidth: 280),
                              decoration: BoxDecoration(
                                color:
                                    isMe ? Colors.blue : Colors.grey.shade300,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Column(
                                crossAxisAlignment: isMe
                                    ? CrossAxisAlignment.end
                                    : CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    msg['text'] ?? '',
                                    style: TextStyle(
                                      color:
                                          isMe ? Colors.white : Colors.black87,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  _buildStatus(msg), // 👈 ICI
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: msgController,
                      decoration: const InputDecoration(
                        hintText: "Type a message...",
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(Icons.send),
                    onPressed: _sendMessage,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
