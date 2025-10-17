import { db } from "./db";
import { platformUsers } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

export async function seedDefaultAdmin() {
  try {
    const targetEmail = "socialplus@ruskmedia.com";
    const targetPassword = "Rusk@123";
    const targetUsername = "admin";
    
    // Check if admin user already exists
    const existingAdmin = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.username, targetUsername))
      .limit(1);

    // Hash the default password
    const hashedPassword = await bcrypt.hash(targetPassword, 10);

    if (existingAdmin.length === 0) {
      // Create default admin user
      await db.insert(platformUsers).values({
        username: targetUsername,
        password: hashedPassword,
        email: targetEmail,
        fullName: "Admin User",
        role: "admin",
        isActive: true,
      });

      console.log("\n✅ DEFAULT ADMIN USER CREATED");
      console.log(`   Username: ${targetUsername}`);
      console.log(`   Email: ${targetEmail}`);
      console.log(`   Password: ${targetPassword}\n`);
    } else {
      // Update existing admin to ensure consistent credentials across all environments
      await db
        .update(platformUsers)
        .set({
          password: hashedPassword,
          email: targetEmail,
          fullName: "Admin User",
          role: "admin",
          isActive: true,
        })
        .where(eq(platformUsers.username, targetUsername));

      console.log("\n✅ DEFAULT ADMIN CREDENTIALS SYNCED");
      console.log(`   Username: ${targetUsername}`);
      console.log(`   Email: ${targetEmail}`);
      console.log(`   Password: ${targetPassword}\n`);
    }
  } catch (error) {
    console.error("\n❌ ERROR SEEDING DEFAULT ADMIN:", error, "\n");
  }
}
