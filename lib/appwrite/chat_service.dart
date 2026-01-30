import 'dart:convert';
import '../config/environment.dart';
import 'appwrite_client.dart';

class ChatService {
  Future<Map<String, dynamic>> _call(Map<String, dynamic> payload) async {
    final exec = await AppwriteClient.functions.createExecution(
      functionId: Environment.chatFunctionId,
      body: jsonEncode(payload), // ✅ must be String in your SDK version
    );

    // ✅ In many Appwrite Flutter SDK versions this is responseBody
    final raw = (exec.responseBody ?? '').toString().trim();
    if (raw.isEmpty) return <String, dynamic>{};

    final decoded = jsonDecode(raw);
    if (decoded is Map<String, dynamic>) return decoded;

    // If function returns non-object JSON
    return <String, dynamic>{"data": decoded};
  }

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
}
