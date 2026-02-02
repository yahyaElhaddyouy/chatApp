import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:chat_app_cloud/state/theme_provider.dart';
import '../../services/chat_service.dart';
import '../../services/appwrite_client.dart';
import '../../config/environment.dart';

class ChatScreen extends StatefulWidget {
  final String conversationId;
  final String otherUserName; // ✅ NEW
  const ChatScreen({
    super.key,
    required this.conversationId,
    required this.otherUserName,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final chatService = ChatService();
  final msgController = TextEditingController();

  List<Map<String, dynamic>> messages = [];
  bool loadingMessages = false;

  String? currentUserId;
  StreamSubscription? _realtimeSub;
  StreamSubscription? _typingSub;

  Timer? _typingDebounce;
  bool _iAmTyping = false;
  bool otherTyping = false;
  String? otherUserId; // si tu l’as déjà

  // Pour afficher Delivered/Seen uniquement sur le dernier message "à moi"
  String? _lastMyMessageId;

  // Petit debounce pour éviter d’appeler markRead/markDelivered trop souvent
  Timer? _markTimer;

  /* ================= HELPERS TIME ================= */
  String _formatTime(dynamic isoOrDt) {
    if (isoOrDt == null) return "";
    try {
      final dt = DateTime.parse(isoOrDt.toString()).toLocal();
      final hh = dt.hour.toString().padLeft(2, '0');
      final mm = dt.minute.toString().padLeft(2, '0');
      return "$hh:$mm";
    } catch (_) {
      return "";
    }
  }

  String _messageCreatedTime(Map<String, dynamic> msg) {
    // Ton schéma contient createdAt (datetime) + Appwrite fournit aussi $createdAt
    final v = msg['createdAt'] ?? msg[r'$createdAt'];
    return _formatTime(v);
  }

  /* ================= LAST MY MESSAGE ================= */
  void _recomputeLastMyMessageId() {
    if (currentUserId == null) return;
    for (final m in messages) {
      if (m['senderId'] == currentUserId) {
        _lastMyMessageId = m[r'$id']?.toString();
        return;
      }
    }
    _lastMyMessageId = null;
  }

  /* ================= MESSAGE STATUS WIDGET ================= */
  Widget _buildStatusInline(Map<String, dynamic> msg) {
    if (msg['senderId'] != currentUserId) return const SizedBox();

    final status = (msg['status'] ?? '').toString();
    // final deliveredAt = msg['deliveredAt'];
    // final readAt = msg['readAt'];

    // Sinon status
    switch (status) {
      case 'sent':
        return Text("✓",
            style:
                TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.85)));
      case 'sending':
        return Text("…",
            style:
                TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.85)));
      default:
        // si backend ne met pas status, on ne casse pas l’UI
        return const SizedBox();
    }
  }

  /// Delivered at / Seen at : uniquement sur le dernier message envoyé par moi
  Widget _buildDeliveredSeenLines(Map<String, dynamic> msg, bool isLastMine) {
    if (!isLastMine) return const SizedBox();
    if (msg['senderId'] != currentUserId) return const SizedBox();

    final deliveredAt = msg['deliveredAt'];
    final readAt = msg['readAt'];

    final lines = <Widget>[];

    if (deliveredAt != null && deliveredAt.toString().isNotEmpty) {
      lines.add(
        Text(
          "${_formatTime(deliveredAt)}",
          style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.75)),
        ),
      );
    }

    if (readAt != null && readAt.toString().isNotEmpty) {
      lines.add(
        Text(
          "${_formatTime(readAt)} ✓✓",
          style: TextStyle(
              fontSize: 11,
              color: const Color.fromARGB(255, 94, 0, 156).withOpacity(0.75)),
        ),
      );
    }

    if (lines.isEmpty) return const SizedBox();
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child:
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: lines),
    );
  }

  /* ================= LOAD MESSAGES ================= */
  Future<void> _loadMessages() async {
    setState(() => loadingMessages = true);

    final res =
        await chatService.listMessages(conversationId: widget.conversationId);

    setState(() => loadingMessages = false);

    if (!mounted) return;

    if (res['ok'] == true) {
      final list = (res['messages'] as List? ?? []);
      // IMPORTANT: on garde l’ordre DESC (plus récent en premier) car tu utilises reverse:true
      final mapped =
          list.map((e) => Map<String, dynamic>.from(e as Map)).toList();

      setState(() {
        messages = mapped;
        _recomputeLastMyMessageId();
      });

      // Quand on ouvre, on marque delivered + read
      _scheduleMarkDeliveredRead();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['error'] ?? 'Failed to load messages')),
      );
    }
  }

  /* ================= MARK DELIVERED / READ (debounced) ================= */
  void _scheduleMarkDeliveredRead() {
    _markTimer?.cancel();
    _markTimer = Timer(const Duration(milliseconds: 300), () async {
      try {
        await chatService.markConversationDelivered(widget.conversationId);
        await chatService.markConversationRead(widget.conversationId);
      } catch (_) {
        // silencieux (pas de spam UI)
      }
    });
  }

  /* ================= REALTIME ================= */
  void _subscribeRealtime() {
    _realtimeSub = AppwriteClient.realtime
        .subscribe([
          'databases.${Environment.databaseId}.collections.messages.documents',
        ])
        .stream
        .listen((event) {
          final payload = Map<String, dynamic>.from(event.payload);

          if (payload['conversationId'] != widget.conversationId) return;

          setState(() {
            // 1) si on a un optimistic local à remplacer
            final localIndex = messages.indexWhere((m) =>
                m['isLocal'] == true &&
                m['text'] == payload['text'] &&
                m['senderId'] == payload['senderId']);

            if (localIndex != -1) {
              // remplace local par doc backend
              messages[localIndex] = payload..remove('isLocal');
              _recomputeLastMyMessageId();
              return;
            }

            // 2) si c’est une mise à jour d’un message existant (readAt/deliveredAt/status…)
            final idx =
                messages.indexWhere((m) => m[r'$id'] == payload[r'$id']);
            if (idx != -1) {
              messages[idx] = payload;
              _recomputeLastMyMessageId();
              return;
            }

            // 3) sinon nouveau message
            messages.insert(0, payload);
            _recomputeLastMyMessageId();
          });

          // Si le message vient de l’autre user, on marque delivered/read immédiatement
          if (payload['senderId'] != null &&
              payload['senderId'] != currentUserId) {
            _scheduleMarkDeliveredRead();
          }
        });

    // 2eme subscription typing service
    // 🔴 TYPING REALTIME (AJOUTE ÇA)
    _typingSub = AppwriteClient.realtime
        .subscribe([
          'databases.${Environment.databaseId}.collections.typing.documents',
        ])
        .stream
        .listen((event) {
          final payload = Map<String, dynamic>.from(event.payload);

          if (payload['conversationId'] != widget.conversationId) return;
          if (payload['userId'] == currentUserId) return;

          setState(() {
            otherTyping = payload['isTyping'] == true;
          });
        });
  }

  /* ================= Typing  Function ================= */
  void _onTypingChanged() {
    final text = msgController.text.trim();
    final nowTyping = text.isNotEmpty;

    if (nowTyping == _iAmTyping) return;
    _iAmTyping = nowTyping;

    // debounce pour éviter spam backend
    _typingDebounce?.cancel();
    _typingDebounce = Timer(const Duration(milliseconds: 250), () {
      chatService.setTyping(
        conversationId: widget.conversationId,
        isTyping: _iAmTyping,
      );
    });

    // auto stop après 2s sans frappe
    if (_iAmTyping) {
      _typingDebounce?.cancel();
      _typingDebounce = Timer(const Duration(seconds: 2), () {
        _iAmTyping = false;
        chatService.setTyping(
          conversationId: widget.conversationId,
          isTyping: false,
        );
      });
    }
  }

  /* ================= INIT / CLEANUP ================= */
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  Future<void> _init() async {
    final user = await AppwriteClient.account.get();
    currentUserId = user.$id;

    await _loadMessages();
    _subscribeRealtime();
    msgController.addListener(_onTypingChanged);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _markTimer?.cancel();
    _realtimeSub?.cancel();
    msgController.dispose();
    _typingDebounce?.cancel();
    msgController.removeListener(_onTypingChanged);
    super.dispose();
  }

  // Si l’app revient au foreground pendant que tu es sur l’écran, on re-mark read
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _scheduleMarkDeliveredRead();
    }
  }

  /* ================= SEND MESSAGE ================= */
  Future<void> _sendMessage() async {
    final text = msgController.text.trim();
    if (text.isEmpty || currentUserId == null) return;

    msgController.clear();

    final localId = 'local-${DateTime.now().millisecondsSinceEpoch}';
    final optimisticMsg = <String, dynamic>{
      r'$id': localId,
      'text': text,
      'senderId': currentUserId,
      'conversationId': widget.conversationId,
      'createdAt': DateTime.now().toIso8601String(),
      'status': 'sending',
      'isLocal': true,
    };

    setState(() {
      messages.insert(0, optimisticMsg);
      _recomputeLastMyMessageId();
    });

    final res = await chatService.sendMessage(
      conversationId: widget.conversationId,
      text: text,
    );

    if (!mounted) return;

    if (res['ok'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(res['error'] ?? 'Failed to send message')),
      );
      return;
    }

    // On NE rajoute pas le message ici (sinon duplication).
    // Le realtime va remplacer le local par le vrai doc backend.
  }

  /* ================= UI ================= */
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        titleSpacing: 0,
        title: Row(
          children: [
            const SizedBox(width: 8),
            // Avatar
            CircleAvatar(
              radius: 20,
              backgroundColor:
                  Theme.of(context).colorScheme.primary.withOpacity(0.15),
              child: Text(
                widget.otherUserName.isNotEmpty
                    ? widget.otherUserName[0].toUpperCase()
                    : '?',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),

            const SizedBox(width: 12),

            // Name + typing
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    widget.otherUserName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: otherTyping
                        ? Text(
                            "typing…",
                            key: const ValueKey("typing"),
                            style: TextStyle(
                              fontSize: 12,
                              color: Theme.of(context)
                                  .colorScheme
                                  .primary
                                  .withOpacity(0.8),
                            ),
                          )
                        : const SizedBox(
                            key: ValueKey("empty"),
                            height: 14,
                          ),
                  ),
                ],
              ),
            ),
          ],
        ),
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

                          final msgId = msg[r'$id']?.toString();
                          final isLastMine = isMe &&
                              msgId != null &&
                              msgId == _lastMyMessageId;

                          final bubbleColor =
                              isMe ? Colors.blue : Colors.grey.shade300;
                          final textColor =
                              isMe ? Colors.white : Colors.black87;

                          return Align(
                            alignment: isMe
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.symmetric(
                                  vertical: 6, horizontal: 12),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 10),
                              constraints: const BoxConstraints(maxWidth: 300),
                              decoration: BoxDecoration(
                                color: bubbleColor,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Column(
                                crossAxisAlignment: isMe
                                    ? CrossAxisAlignment.end
                                    : CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    msg['text'] ?? '',
                                    style: TextStyle(color: textColor),
                                  ),
                                  const SizedBox(height: 6),

                                  // Ligne: heure du message + ticks
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      Text(
                                        _messageCreatedTime(msg),
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: isMe
                                              ? Colors.white.withOpacity(0.75)
                                              : Colors.black54,
                                        ),
                                      ),
                                      const SizedBox(width: 6),
                                      if (isMe) _buildStatusInline(msg),
                                    ],
                                  ),

                                  // Lignes Delivered/Seen uniquement sur le dernier message "à moi"
                                  if (isMe)
                                    _buildDeliveredSeenLines(msg, isLastMine),
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
