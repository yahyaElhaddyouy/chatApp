// import 'package:appwrite/appwrite.dart';
// import 'package:appwrite/models.dart';
// import 'appwrite_client.dart';

// class AuthService {
//   Future<User> me() async {
//     return await AppwriteClient.account.get();
//   }

//   Future<void> signup({
//     required String name,
//     required String email,
//     required String password,
//   }) async {
//     await AppwriteClient.account.create(
//       userId: ID.unique(),
//       email: email,
//       password: password,
//       name: name,
//     );
//   }

//   Future<void> login({
//     required String email,
//     required String password,
//   }) async {
//     await AppwriteClient.account.createEmailPasswordSession(
//       email: email,
//       password: password,
//     );
//   }

//   Future<void> logout() async {
//     await AppwriteClient.account.deleteSession(sessionId: 'current');
//   }
// }


import 'package:appwrite/appwrite.dart';
import 'package:appwrite/models.dart';
import 'appwrite_client.dart';

class AuthService {
  final Account _account = Account(AppwriteClient.client);

  Future<User> currentUser() => _account.get();

  Future<Session> login({
    required String email,
    required String password,
  }) {
    return _account.createEmailPasswordSession(
      email: email.trim(),
      password: password,
    );
  }

  Future<User> signup({
    required String email,
    required String password,
    required String name,
  }) async {
    final user = await _account.create(
      userId: ID.unique(),
      email: email.trim(),
      password: password,
      name: name.trim(),
    );
    return user;
  }

  Future<void> logout() => _account.deleteSession(sessionId: 'current');
}
