import 'dart:convert';
import '../config/environment.dart';
import 'appwrite_client.dart';

class ChatService {
  Future<Map<String, dynamic>> _call(Map<String, dynamic> payload) async {
    final exec = await AppwriteClient.functions.createExecution(
      functionId: Environment.chatFunctionId,
      body: jsonEncode(payload), // ✅ must be String in your SDK version
    );

    final raw = (exec.responseBody ?? '').toString().trim();
    if (raw.isEmpty) return <String, dynamic>{};

    final decoded = jsonDecode(raw);
    if (decoded is Map<String, dynamic>) return decoded;

    // If function returns non-object JSON
    return <String, dynamic>{"data": decoded};
  }

  // Fetch all conversations for the current user
  Future<Map<String, dynamic>> listConversations() async {
    return _call({
      "action": "listConversations",
      "databaseId": Environment.databaseId,
      "membershipsCollectionId": Environment.membershipsCollectionId,
    });
  }

  // Fetch all messages for a specific conversation
  Future<Map<String, dynamic>> listMessages({
    required String conversationId,
  }) async {
    return _call({
      "action": "listMessages",
      "databaseId": Environment.databaseId,
      "messagesCollectionId": Environment.messagesCollectionId,
      "conversationId": conversationId,
    });
  }

  // Send a message to a conversation
  Future<Map<String, dynamic>> sendMessage({
    required String conversationId,
    required String text,
  }) async {
    return _call({
      "action": "sendMessage",
      "databaseId": Environment.databaseId,
      "conversationsCollectionId": Environment.conversationsCollectionId,
      "membershipsCollectionId": Environment.membershipsCollectionId,
      "messagesCollectionId": Environment.messagesCollectionId,
      "conversationId": conversationId,
      "text": text,
    });
  }

  // Mark messages as read in a conversation
  Future<Map<String, dynamic>> markRead({required String conversationId}) async {
    return _call({
      "action": "markRead",
      "databaseId": Environment.databaseId,
      "conversationsCollectionId": Environment.conversationsCollectionId,
      "membershipsCollectionId": Environment.membershipsCollectionId,
      "messagesCollectionId": Environment.messagesCollectionId,
      "conversationId": conversationId,
    });
  }

  // Create a new Direct Message (DM)
  Future<Map<String, dynamic>> createDm({required String otherEmail}) async {
    return _call({
      "action": "createDm",
      "databaseId": Environment.databaseId,
      "conversationsCollectionId": Environment.conversationsCollectionId,
      "membershipsCollectionId": Environment.membershipsCollectionId,
      "messagesCollectionId": Environment.messagesCollectionId,
      "otherEmail": otherEmail,
    });
  }
}
