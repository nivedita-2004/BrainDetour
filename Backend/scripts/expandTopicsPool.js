const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const dns = require('dns');

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config({ path: path.join(__dirname, '../.env') });

const Topic = require('../src/models/Topic');
const { TOPIC_CATEGORIES } = require('../src/models/Topic');
const { generateAndSaveTopics } = require('../src/services/topicGenerationService');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expandTopicsPool(targetPerCategory = 50) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MONGODB_URI missing in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB. Auditing current topic counts...\n');

  const beforeCounts = {};
  for (const cat of TOPIC_CATEGORIES) {
    beforeCounts[cat] = await Topic.countDocuments({ category: cat, isActive: true });
  }

  console.log('Initial Topic Counts:');
  console.table(beforeCounts);

  let totalNewCreated = 0;

  for (const cat of TOPIC_CATEGORIES) {
    let currentCount = await Topic.countDocuments({ category: cat, isActive: true });
    console.log(`\n========================================`);
    console.log(`Processing [${cat}] (Current: ${currentCount}/${targetPerCategory})`);
    console.log(`========================================`);

    let consecutiveFailures = 0;

    while (currentCount < targetPerCategory && consecutiveFailures < 3) {
      const needed = targetPerCategory - currentCount;
      const batchSize = Math.min(22, needed);
      console.log(`Generating batch of ${batchSize} for ${cat}...`);

      try {
        const created = await generateAndSaveTopics(cat, batchSize, `expand-${Date.now()}`);
        console.log(`[+] Added ${created.length} new distinct topics to ${cat}`);
        totalNewCreated += created.length;
        currentCount = await Topic.countDocuments({ category: cat, isActive: true });
        console.log(`    New count for ${cat}: ${currentCount}/${targetPerCategory}`);
        consecutiveFailures = 0;

        // Pacing pause to respect rate limits
        await wait(3000);
      } catch (err) {
        consecutiveFailures++;
        console.warn(`[!] Batch generation warning for ${cat}: ${err.message}`);
        console.log(`    Waiting 6s before retry (attempt ${consecutiveFailures}/3)...`);
        await wait(6000);
      }
    }
  }

  console.log('\n========================================');
  console.log('EXPANSION COMPLETE');
  console.log(`Total new topics generated and persisted: ${totalNewCreated}`);
  console.log('========================================\n');

  const afterCounts = {};
  for (const cat of TOPIC_CATEGORIES) {
    afterCounts[cat] = await Topic.countDocuments({ category: cat, isActive: true });
  }
  console.log('Final Topic Counts in MongoDB:');
  console.table(afterCounts);

  await mongoose.disconnect();
}

if (require.main === module) {
  const target = parseInt(process.argv[2], 10) || 50;
  expandTopicsPool(target).catch((err) => {
    console.error('Fatal expansion error:', err);
    process.exit(1);
  });
}

module.exports = { expandTopicsPool };
