import 'package:flutter/material.dart';
import '../../services/chat_service.dart';
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

  // Fetch conversations for the current user
  Future<void> _loadConversations() async {
    setState(() {
      loadingConversations = true;
    });

    final res = await chatService.listConversations();

    setState(() {
      loadingConversations = false;
    });

    if (res['ok'] == true) {
      final conversationsList = res['conversations'] as List;
      setState(() {
        conversations = conversationsList.map((e) => e as Map<String, dynamic>).toList();
      });
    } else {
      // Handle error (showing snackbar)
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(res['error'] ?? 'Failed to load conversations'),
      ));
    }
  }

  // Open a bottom sheet for the user to input email and create a new DM
  Future<void> _openNewDmSheet() async {
    final emailC = TextEditingController();

    await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16, right: 16,
            top: 12,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text("New DM", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
              const SizedBox(height: 12),
              TextField(
                controller: emailC,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: "Enter email"),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () async {
                  if (emailC.text.isNotEmpty) {
                    final userId = 'USER_ID'; // Replace with the actual userId from the logged-in user
                    final response = await chatService.createDm(otherEmail: emailC.text, userId: userId);

                    if (response['ok'] == true) {
                      Navigator.pop(ctx, emailC.text); // Close the sheet
                      // Handle success (e.g., show success Snackbar)
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text('DM created successfully'),
                      ));
                    } else {
                      // Handle failure (show failure snackbar)
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text(response['error'] ?? 'Failed to create DM'),
                      ));
                    }
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
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Chats"),
        actions: [
          IconButton(
            onPressed: () {
              // Add your logout functionality here if needed
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openNewDmSheet, // Open the bottom sheet to create new DM
        child: const Icon(Icons.add),
      ),
      body: loadingConversations
          ? const Center(child: CircularProgressIndicator())
          : conversations.isEmpty
              ? const Center(child: Text("No chats yet. Create a DM above."))
              : ListView.builder(
                  itemCount: conversations.length,
                  itemBuilder: (context, index) {
                    final conversation = conversations[index];
                    final title = conversation['title'] ?? 'DM';
                    final lastMessage = conversation['lastMessageText'] ?? 'No messages';
                    final conversationId = conversation['\$id'];

                    return ListTile(
                      title: Text(title),
                      subtitle: Text(lastMessage),
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ChatScreen(conversationId: conversationId),
                          ),
                        );
                      },
                    );
                  },
                ),
    );
  }
}
