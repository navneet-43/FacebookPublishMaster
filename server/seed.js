import bcrypt from 'bcrypt';
import { db } from './db.ts';
import { platformUsers } from '../shared/schema.ts';

async function seedAdmin() {
  console.log('🔄 Seeding default admin user...');
  
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const [admin] = await db
      .insert(platformUsers)
      .values({
        username: 'admin',
        password: hashedPassword,
        email: 'admin@socialflow.com',
        fullName: 'Administrator',
        role: 'admin',
        isActive: true,
      })
      .onConflictDoUpdate({
        target: platformUsers.email,
        set: {
          username: 'admin',
          password: hashedPassword,
          fullName: 'Administrator',
          role: 'admin',
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    console.log('✅ Default admin user created/updated:');
    console.log('   Email: admin@socialflow.com');
    console.log('   Password: admin123');
    console.log('   Role: admin');
  } catch (error) {
    console.error('❌ Error seeding admin user:', error);
  }
}

seedAdmin();