import 'package:appwrite/appwrite.dart';
import '../config/environment.dart';

class AppwriteClient {
  AppwriteClient._();

  // Initialize the client and other Appwrite services
  static final Client client = Client()
      .setEndpoint(Environment.appwritePublicEndpoint)
      .setProject(Environment.appwriteProjectId);

  static final Account account = Account(client);
  static final Functions functions = Functions(client);
  static final Databases databases = Databases(client);
  static final Realtime realtime = Realtime(client);

  // Fetch the logged-in userId from Appwrite Account
  Future<String?> getUserId() async {
    try {
      final user = await account.get(); // Fetch the logged-in user details
      return user.$id;  // Return the user ID
    } catch (e) {
      print('Error fetching user info: $e');
      return null;  // Return null if user info cannot be fetched
    }
  }
}
