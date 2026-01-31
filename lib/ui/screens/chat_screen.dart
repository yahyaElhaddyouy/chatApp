import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../services/chat_service.dart';
import '../../state/session_provider.dart';

class ChatScreen extends StatefulWidget {
  final String conversationId;
  const ChatScreen({super.key, required this.conversationId});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final chatService = ChatService();
  final msgC = TextEditingController();
  bool sending = false;

  // until listMessages is implemented: optimistic local list
  final List<Map<String, dynamic>> messages = [];

  @override
  void dispose() {
    msgC.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = msgC.text.trim();
    if (text.isEmpty) return;

    setState(() => sending = true);

    try {
      final res = await chatService.sendMessage(
        conversationId: widget.conversationId,
        text: text,
      );

      if (res['ok'] == true) {
        msgC.clear();
        setState(() {
          messages.insert(0, res['message'] as Map<String, dynamic>);
        });
      } else {
        final err = (res['error'] ?? res.toString()).toString();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
      }
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<SessionProvider>().user?.$id;

    return Scaffold(
      appBar: AppBar(title: const Text("Chat")),
      body: Column(
        children: [
          Expanded(
            child: messages.isEmpty
                ? const Center(child: Text("Say hi 👋"))
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(12),
                    itemCount: messages.length,
                    itemBuilder: (context, i) {
                      final m = messages[i];
                      final text = (m['text'] ?? '').toString();
                      final senderId = (m['senderId'] ?? '').toString();
                      final isMe = me != null && senderId == me;

                      return Align(
                        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          constraints: const BoxConstraints(maxWidth: 320),
                          decoration: BoxDecoration(
                            color: isMe
                                ? Theme.of(context).colorScheme.primary
                                : Colors.white,
                            borderRadius: BorderRadius.circular(16),
                            border: isMe ? null : Border.all(color: const Color(0xFFE6E6F0)),
                          ),
                          child: Text(
                            text,
                            style: TextStyle(
                              color: isMe ? Colors.white : Colors.black87,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: msgC,
                      decoration: const InputDecoration(hintText: "Message..."),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: sending ? null : _send,
                      child: sending
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.send),
                    ),
                  ),
                ],
              ),
            ),
          )
        ],
      ),
    );
  }
}
