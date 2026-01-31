import 'dart:convert';
import '../config/environment.dart';
import 'appwrite_client.dart';
import 'package:appwrite/appwrite.dart';

class ChatService {
  // Helper function to send a request to Appwrite Function
  Future<Map<String, dynamic>> _call(Map<String, dynamic> payload) async {
    try {
      final exec = await AppwriteClient.functions.createExecution(
        functionId: Environment.chatFunctionId,
        body: jsonEncode(payload), // Must be String in your SDK version
      );

      // Handle empty or invalid response
      final raw = (exec.responseBody ?? '').toString().trim();
      if (raw.isEmpty) return <String, dynamic>{};

      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;

      // If the function returns non-object JSON
      return <String, dynamic>{"data": decoded};
    } catch (e) {
      print('Error calling Appwrite function: $e');
      return {'ok': false, 'error': 'Failed to call Appwrite function'};
    }
  }

  // Fetch all conversations for the current user
  Future<Map<String, dynamic>> listConversations() async {
    return _call({
      "action": "listConversations", // Action is 'listConversations'
      "databaseId": Environment.databaseId,
      "membershipsCollectionId": Environment.membershipsCollectionId,
    });
  }

  // Fetch all messages for a specific conversation
  Future<Map<String, dynamic>> listMessages({
    required String conversationId,
  }) async {
    return _call({
      "action": "listMessages", // Action is 'listMessages'
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
      "action": "sendMessage", // Action is 'sendMessage'
      "databaseId": Environment.databaseId,
      "conversationsCollectionId": Environment.conversationsCollectionId,
      "membershipsCollectionId": Environment.membershipsCollectionId,
      "messagesCollectionId": Environment.messagesCollectionId,
      "conversationId": conversationId,
      "text": text, // Text message to send
    });
  }

  // Mark messages as read in a conversation
  Future<Map<String, dynamic>> markRead(
      {required String conversationId}) async {
    return _call({
      "action": "markRead", // Action is 'markRead'
      "databaseId": Environment.databaseId,
      "conversationsCollectionId": Environment.conversationsCollectionId,
      "membershipsCollectionId": Environment.membershipsCollectionId,
      "messagesCollectionId": Environment.messagesCollectionId,
      "conversationId": conversationId,
    });
  }

  // Create a new Direct Message (DM)
  Future<Map<String, dynamic>> createDm({
  required String otherEmail,
  required String userId,
}) async {
  final payload = {
    "action": "createDm",  // Ensure action is passed
    "otherEmail": otherEmail,
    "userId": userId,  // Fetch the real userId dynamically
  };

  return _call(payload);  // Call the function with the payload
}


  // Fetch the logged-in userId from Appwrite Account
  Future<String?> getUserId() async {
    try {
      final account = Account(AppwriteClient.client);
      final user = await account.get(); // Get the current logged-in user
      return user.$id;  // Return the user ID
    } catch (e) {
      print('Error fetching user info: $e');
      return null;
    }
  }
}
