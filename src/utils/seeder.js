import { db } from "../config/firebase";
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { SEED_DATA } from "../data/seed";

export const seedDatabase = async () => {
    try {
        console.log("Starting seed...");
        const batch = writeBatch(db);
        let count = 0;

        for (const [dateKey, data] of Object.entries(SEED_DATA)) {
            const docRef = doc(db, "tips", dateKey);
            batch.set(docRef, data);
            count++;
        }

        await batch.commit();
        console.log(`Successfully seeded ${count} documents.`);
        alert(`Successfully seeded ${count} documents!`);
    } catch (error) {
        console.error("Error seeding database:", error);
        alert("Error seeding database. Check console.");
    }
};
