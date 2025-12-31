import YAML from 'js-yaml';
import { readFileSync } from 'fs';

const configFile = readFileSync('./config/agent-config.yaml', 'utf8');
const config = YAML.load(configFile);

console.log('\n📋 Agent Config Sources:');
config.packs.forEach((pack, i) => {
  console.log(`\nPack ${i}: ${pack.packId}`);
  if (pack.config?.sources) {
    pack.config.sources.forEach(source => {
      console.log(`  Source: ${source.name}`);
      console.log(`  Domains: ${source.fromDomains?.join(', ')}`);
      console.log(`  Keywords (first 5): ${source.keywords?.slice(0, 5).join(', ')}`);
    });
  }
});

// Simulate the query building
const pack = config.packs[0]; // school pack
const hasConfiguredSources = pack.config?.sources && pack.config.sources.length > 0;

console.log(`\n🔍 Discovery Mode Check:`);
console.log(`Has configured sources: ${hasConfiguredSources}`);

if (hasConfiguredSources) {
  const domains = [];
  for (const source of pack.config.sources) {
    if (source.fromDomains) {
      domains.push(...source.fromDomains);
    }
  }
  
  console.log(`\nDomains found: ${domains.join(', ')}`);
  
  if (domains.length > 0) {
    const domainQuery = domains
      .map(d => `from:${d}`)
      .join(' OR ');
    const lookbackDays = 90;
    const date = new Date();
    date.setDate(date.getDate() - lookbackDays);
    const dateFilter = `after:${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    
    const query = `${dateFilter} (${domainQuery})`;
    console.log(`\n📧 Gmail Query That Should Be Used:\n${query}`);
  }
}
