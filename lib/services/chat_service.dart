import 'dart:convert';
import '../config/environment.dart';
import 'appwrite_client.dart';

class ChatService {
  Future<Map<String, dynamic>> _call(Map<String, dynamic> payload) async {
    final exec = await AppwriteClient.functions.createExecution(
      functionId: Environment.chatFunctionId,
      body: jsonEncode(payload), // ✅ must be String in your SDK version
    );

    // ✅ Dans ta version: responseBody est NON-null (String)
    final raw = exec.responseBody.toString().trim();

    if (raw.isEmpty) return <String, dynamic>{};

    dynamic decoded;
    try {
      decoded = jsonDecode(raw);
    } catch (_) {
      // Si le backend renvoie du texte non-JSON, on l'encapsule
      return <String, dynamic>{'data': raw};
    }

    if (decoded is Map<String, dynamic>) return decoded;

    // Si la function renvoie une liste / string / int, on encapsule
    return <String, dynamic>{'data': decoded};
  }

  Future<Map<String, dynamic>> createDm({required String otherEmail}) async {
    return _call({
      'action': 'createDm',
      'databaseId': Environment.databaseId,
      'conversationsCollectionId': Environment.conversationsCollectionId,
      'membershipsCollectionId': Environment.membershipsCollectionId,
      'messagesCollectionId': Environment.messagesCollectionId,
      'otherEmail': otherEmail.trim(),
    });
  }

  Future<Map<String, dynamic>> sendMessage({
    required String conversationId,
    required String text,
  }) async {
    final cleaned = text.trim();
    if (cleaned.isEmpty) {
      return <String, dynamic>{'ok': false, 'code': 'EMPTY_TEXT'};
    }

    return _call({
      'action': 'sendMessage',
      'databaseId': Environment.databaseId,
      'conversationsCollectionId': Environment.conversationsCollectionId,
      'membershipsCollectionId': Environment.membershipsCollectionId,
      'messagesCollectionId': Environment.messagesCollectionId,
      'conversationId': conversationId,
      'text': cleaned,
    });
  }

  Future<Map<String, dynamic>> markRead({required String conversationId}) async {
    return _call({
      'action': 'markRead',
      'databaseId': Environment.databaseId,
      'conversationsCollectionId': Environment.conversationsCollectionId,
      'membershipsCollectionId': Environment.membershipsCollectionId,
      'messagesCollectionId': Environment.messagesCollectionId,
      'conversationId': conversationId,
    });
  }

  // Optionnel (si tu l'implémentes côté backend)
  Future<Map<String, dynamic>> listMessages({
    required String conversationId,
    int limit = 50,
    String? cursor,
  }) async {
    return _call({
      'action': 'listMessages',
      'databaseId': Environment.databaseId,
      'messagesCollectionId': Environment.messagesCollectionId,
      'conversationId': conversationId,
      'limit': limit,
      if (cursor != null) 'cursor': cursor,
    });
  }

  // Optionnel (si tu l'implémentes côté backend)
  Future<Map<String, dynamic>> listConversations({
    int limit = 50,
    String? cursor,
  }) async {
    return _call({
      'action': 'listConversations',
      'databaseId': Environment.databaseId,
      'conversationsCollectionId': Environment.conversationsCollectionId,
      'membershipsCollectionId': Environment.membershipsCollectionId,
      'limit': limit,
      if (cursor != null) 'cursor': cursor,
    });
  }
}
