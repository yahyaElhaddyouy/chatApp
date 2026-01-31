import 'package:appwrite/appwrite.dart';
import '../config/environment.dart';

class AppwriteClient {
  AppwriteClient._();

  static final Client client = Client()
      .setEndpoint(Environment.appwritePublicEndpoint)
      .setProject(Environment.appwriteProjectId);

  static final Account account = Account(client);
  static final Functions functions = Functions(client);
  static final Databases databases = Databases(client);
  static final Realtime realtime = Realtime(client);
}
