import yaml from 'js-yaml';
import { Abstraction, Relationship, ProjectAnalysis, OrderChaptersOptions } from '../types';
import { LlmProvider, LlmGenerationOptions } from '../llm/types';

/**
 * Helper function to parse abstraction references like "0 # AbstractionName" or just "0"
 * into an integer index. (Similar to the one in analyze-relationships)
 * @param rawRef The raw reference string or number from LLM.
 * @param maxIndex The maximum valid index (abstractions.length - 1).
 * @returns The validated integer index.
 * @throws Error if validation fails.
 */
function parseAbstractionRefForOrder(rawRef: any, maxIndex: number): number {
  let indexInt: number;

  if (typeof rawRef === 'number') {
    indexInt = rawRef;
  } else if (typeof rawRef === 'string') {
    const match = rawRef.match(/^(\d+)/); // Match digits at the beginning
    if (match && match[1]) {
      indexInt = parseInt(match[1], 10);
    } else {
      // Try parsing as just a number string if no "#" present
      const directInt = parseInt(rawRef, 10);
      if (!isNaN(directInt)) {
        indexInt = directInt;
      } else {
        throw new Error(`Invalid abstraction reference format for order: Expected number, 'index # Name', or 'index', got '${rawRef}'.`);
      }
    }
  } else {
    throw new Error(`Invalid type for abstraction reference for order: Expected number or string, got ${typeof rawRef}.`);
  }

  if (isNaN(indexInt) || indexInt < 0 || indexInt > maxIndex) {
    throw new Error(`Abstraction index ${indexInt} is out of bounds (0-${maxIndex}).`);
  }
  return indexInt;
}


export async function orderChapters(
  abstractions: Abstraction[],
  projectAnalysis: ProjectAnalysis,
  projectName: string,
  llmProvider: LlmProvider, // Nuevo parámetro
  options: OrderChaptersOptions = {}
): Promise<number[]> {
  if (!abstractions || abstractions.length === 0) {
    console.warn("orderChapters called with no abstractions. Returning empty array.");
    return [];
  }
  if (!projectAnalysis) {
    console.warn("orderChapters called with no projectAnalysis. Results might be poor.");
    // Provide a default empty analysis to prevent crashes, though LLM results will be suboptimal.
    projectAnalysis = { summary: "No project summary provided.", relationships: [] };
  }


  const {
    language = 'english', // Default to English
    useCache = true,
    llmOptions // Nuevo
  } = options;

  // 1. Create LLM Context
  const abstractionListForPrompt = abstractions.map((abs, i) => `- ${i} # ${abs.name}`).join("\n");

  let relationshipsContext = "Relationships between abstractions:\n";
  if (projectAnalysis.relationships && projectAnalysis.relationships.length > 0) {
    projectAnalysis.relationships.forEach(rel => {
      const fromAbs = abstractions[rel.from];
      const toAbs = abstractions[rel.to];
      if (fromAbs && toAbs) {
        relationshipsContext += `- From ${rel.from} (${fromAbs.name}) to ${rel.to} (${toAbs.name}): ${rel.label}\n`;
      } else {
        relationshipsContext += `- Relationship with invalid abstraction index: from ${rel.from} to ${rel.to}\n`;
      }
    });
  } else {
    relationshipsContext += "No specific relationships were identified or provided.\n";
  }
  
  const projectSummary = projectAnalysis.summary || "No project summary was provided.";

  // 2. Construct Prompt
  // Ported and adapted from Python version's OrderChapters node
  const prompt = `
Your task is to determine the optimal order for explaining the key abstractions of a software project named "${projectName}" in a tutorial.
The goal is to present the abstractions in a logical sequence that helps a learner understand the project, starting from the most foundational or user-facing concepts and progressing to more detailed or dependent ones.

You are provided with:
1.  A list of key abstractions (with their current index and name).
2.  A summary of the project.
3.  A list of identified relationships between these abstractions.

List of Abstractions:
<abstractions_list>
${abstractionListForPrompt}
</abstractions_list>

Project Summary (This summary might be in ${language}):
<project_summary>
${projectSummary}
</project_summary>

Identified Relationships (Relationship labels might be in ${language}):
<relationships_context>
${relationshipsContext}
</relationships_context>

Considering the project summary and the relationships, please determine the best order to explain these abstractions.
The order should be a sequence of abstraction indices, from the first one to explain to the last.
Ensure that every abstraction from the list above is included exactly once in your proposed order.

Please format your response as a YAML list of abstraction indices.
You can list just the index number, or "index # Name" for clarity (we will parse the index).

Example YAML output:
\`\`\`yaml
- 0 # User Interface Module
- 2 # Core Logic Handler
- 1 # Database Connector
\`\`\`
Or simply:
\`\`\`yaml
- 0
- 2
- 1
\`\`\`

${language !== 'english' ? `Note: The abstraction names, project summary, and relationship labels provided above might be in ${language}. Your output should be a list of indices as shown in the example.\n` : ''}

Now, provide the YAML list representing the ordered abstraction indices.
`;

  // 3. Call LLM
  const finalLlmOptions: LlmGenerationOptions = {
    ...(llmOptions || {}),
    useCache: useCache,
  };
  console.log(`Calling LLM to order chapters for project "${projectName}"...`);
  const llmResponse = await llmProvider.generateContent(prompt, finalLlmOptions);

  // 4. Parse and Validate Output
  let rawOrderedIndices: any;
  try {
    const yamlMatch = llmResponse.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch || !yamlMatch[1]) {
      console.warn("No explicit YAML block found (```yaml ... ```), attempting to parse entire LLM response.");
      try {
        rawOrderedIndices = yaml.load(llmResponse);
      } catch (e: any) {
         throw new Error(`Failed to parse LLM response as YAML (no explicit block, direct parse failed): ${e.message}\nRaw response:\n${llmResponse.substring(0, 500)}...`);
      }
    } else {
        rawOrderedIndices = yaml.load(yamlMatch[1]);
    }
  } catch (e: any) {
    throw new Error(`Invalid YAML from LLM: ${e.message}\nRaw YAML part:\n${(e.mark && e.mark.buffer) ? e.mark.buffer.substring(0, 500) : llmResponse.substring(0,500)}...`);
  }

  if (!Array.isArray(rawOrderedIndices)) {
    throw new Error(`LLM output is not an array of ordered indices. Received: ${typeof rawOrderedIndices}\nContent:\n${JSON.stringify(rawOrderedIndices, null, 2).substring(0,500)}...`);
  }

  const validatedOrderedIndices: number[] = [];
  const maxAbsIndex = abstractions.length - 1;
  const receivedIndicesSet = new Set<number>();

  for (const rawIdx of rawOrderedIndices) {
    try {
      const validatedIndex = parseAbstractionRefForOrder(rawIdx, maxAbsIndex);
      if (receivedIndicesSet.has(validatedIndex)) {
        throw new Error(`Duplicate abstraction index ${validatedIndex} found in LLM output.`);
      }
      validatedOrderedIndices.push(validatedIndex);
      receivedIndicesSet.add(validatedIndex);
    } catch (e: any) {
      // Log the error and potentially re-throw or handle, depending on desired strictness
      console.error(`Error validating ordered index from LLM: ${e.message}`, rawIdx);
      throw new Error(`Invalid index found in LLM chapter order output: ${e.message}. Raw item: '${rawIdx}'`);
    }
  }

  // Check for missing indices
  if (validatedOrderedIndices.length !== abstractions.length) {
    const expectedIndices = new Set(abstractions.map((_, i) => i));
    const missing = [...expectedIndices].filter(idx => !receivedIndicesSet.has(idx));
    throw new Error(`LLM output for chapter order is incomplete. Missing indices: [${missing.join(', ')}]. Expected ${abstractions.length}, got ${validatedOrderedIndices.length}.`);
  }
  
  console.log(`Successfully ordered ${validatedOrderedIndices.length} chapters.`);
  return validatedOrderedIndices;
}
