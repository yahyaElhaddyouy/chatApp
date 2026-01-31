import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/chat_service.dart';

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

  // Load messages for the conversation
  Future<void> _loadMessages() async {
    setState(() {
      loadingMessages = true;
    });

    final res = await chatService.listMessages(conversationId: widget.conversationId);

    setState(() {
      loadingMessages = false;
    });

    if (res['ok'] == true) {
      final messagesList = res['messages'] as List;
      setState(() {
        messages = messagesList.map((e) => e as Map<String, dynamic>).toList();
      });
    } else {
      // Handle error (showing snackbar)
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(res['error'] ?? 'Failed to load messages'),
      ));
    }
  }

  @override
  void initState() {
    super.initState();
    _loadMessages();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Chat")),
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
                          final message = messages[index];
                          final senderId = message['senderId'];
                          final text = message['text'];
                          final isMe = senderId == 'currentUserId'; // Replace with the actual user ID

                          return Align(
                            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.symmetric(vertical: 6),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              constraints: const BoxConstraints(maxWidth: 300),
                              decoration: BoxDecoration(
                                color: isMe ? Colors.blue : Colors.grey.shade300,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                text,
                                style: TextStyle(color: isMe ? Colors.white : Colors.black),
                              ),
                            ),
                          );
                        },
                      ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: msgController,
                    decoration: const InputDecoration(hintText: "Type a message..."),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send),
                  onPressed: () {
                    if (msgController.text.isNotEmpty) {
                      _sendMessage();
                    }
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // Send message
  Future<void> _sendMessage() async {
    final text = msgController.text.trim();
    if (text.isEmpty) return;

    final res = await chatService.sendMessage(
      conversationId: widget.conversationId,
      text: text,
    );

    if (res['ok'] == true) {
      msgController.clear();
      // Add message to the list (optimistic UI update)
      setState(() {
        messages.insert(0, res['message'] as Map<String, dynamic>);
      });
    } else {
      // Handle error (showing snackbar)
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(res['error'] ?? 'Failed to send message'),
      ));
    }
  }
}
