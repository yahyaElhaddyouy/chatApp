import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../services/chat_service.dart';
import '../../state/session_provider.dart';
import '../../state/theme_provider.dart';
import 'chat_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  final ChatService chatService = ChatService();

  // TODO: Replace this with listConversations() once backend supports it.
  final List<Map<String, dynamic>> conversations = [];

  Future<void> _openNewDmSheet() async {
    final emailC = TextEditingController();
    bool creating = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).cardTheme.color,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setSheetState) {
            Future<void> submit() async {
              final email = emailC.text.trim();
              if (email.isEmpty || creating) return;

              setSheetState(() => creating = true);

              try {
                final res = await chatService.createDm(otherEmail: email);

                if (res['ok'] == true) {
                  final convo = res['conversation'] as Map<String, dynamic>;
                  final id = convo[r'$id'] as String;

                  if (ctx.mounted) Navigator.pop(ctx);

                  if (!mounted) return;
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ChatScreen(conversationId: id)),
                  );
                } else {
                  final err = (res['error'] ?? res.toString()).toString();
                  if (ctx.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
                  }
                }
              } catch (e) {
                if (ctx.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
                }
              } finally {
                if (ctx.mounted) setSheetState(() => creating = false);
              }
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 10,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "New DM",
                    style: Theme.of(ctx).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    "Enter the email of the user you want to chat with.",
                    style: Theme.of(ctx).textTheme.bodyMedium?.copyWith(color: Colors.black54),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: emailC,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: "Other user's email",
                    ),
                    onSubmitted: (_) => submit(),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: creating ? null : submit,
                      child: creating
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text("Create"),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );

    emailC.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final theme = context.watch<ThemeProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text("Chats"),
        actions: [
          IconButton(
            tooltip: theme.mode == ThemeMode.dark ? "Light mode" : "Dark mode",
            icon: Icon(theme.mode == ThemeMode.dark ? Icons.light_mode : Icons.dark_mode),
            onPressed: () => context.read<ThemeProvider>().toggleDarkLight(),
          ),
          IconButton(
            tooltip: "Logout",
            onPressed: () async => session.logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openNewDmSheet,
        child: const Icon(Icons.add),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: conversations.isEmpty
            ? Center(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.chat_bubble_outline, size: 44),
                        const SizedBox(height: 12),
                        Text(
                          "No chats yet",
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          "Tap + to start a new DM.",
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: const Color.fromARGB(137, 15, 66, 206)),
                        ),
                        const SizedBox(height: 14),
                        SizedBox(
                          width: 220,
                          child: ElevatedButton.icon(
                            onPressed: _openNewDmSheet,
                            icon: const Icon(Icons.add),
                            label: const Text("New DM"),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              )
            : ListView.separated(
                itemCount: conversations.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) {
                  final c = conversations[i];
                  final title = (c['title'] ?? 'DM').toString();
                  final last = (c['lastMessageText'] ?? '').toString();

                  return Card(
                    child: ListTile(
                      leading: CircleAvatar(
                        child: Text(title.isNotEmpty ? title[0].toUpperCase() : "D"),
                      ),
                      title: Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(
                        last,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onTap: () {
                        final id = c[r'$id'];
                        if (id is String && id.isNotEmpty) {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => ChatScreen(conversationId: id)),
                          );
                        }
                      },
                    ),
                  );
                },
              ),
      ),
    );
  }
}
