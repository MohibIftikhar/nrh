const bcrypt = require('bcryptjs');

// Passwords to hash
const passwords = ['password123', 'securepassword'];

// Hash each password
passwords.forEach((password) => {
  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      console.error('Error hashing password:', err);
      return;
    }
    console.log(`Password: ${password}`);
    console.log(`Hashed: ${hash}\n`);
  });
});