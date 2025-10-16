import { db } from "./db";
import { platformUsers } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

export async function seedDefaultAdmin() {
  try {
    // Check if admin user already exists
    const existingAdmin = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.username, "admin"))
      .limit(1);

    if (existingAdmin.length === 0) {
      // Hash the default password
      const hashedPassword = await bcrypt.hash("Rusk@123", 10);

      // Create default admin user
      await db.insert(platformUsers).values({
        username: "admin",
        password: hashedPassword,
        email: "socialplus@ruskmedia.com",
        fullName: "Admin User",
        role: "admin",
        isActive: true,
      });

      console.log("\n✅ DEFAULT ADMIN USER CREATED");
      console.log("   Username: admin");
      console.log("   Password: Rusk@123");
      console.log("   Email: socialplus@ruskmedia.com\n");
    }
    // No message if admin already exists to avoid log noise
  } catch (error) {
    console.error("\n❌ ERROR SEEDING DEFAULT ADMIN:", error, "\n");
  }
}
