import yaml from 'js-yaml';
import { FetchedFile } from '../utils/crawl_github_files';
import { Abstraction, Relationship, ProjectAnalysis, AnalyzeRelationshipsOptions } from '../types';
import { LlmProvider, LlmGenerationOptions } from '../llm/types';

/**
 * Helper function to parse abstraction references like "0 # AbstractionName" or just "0"
 * into an integer index.
 * @param rawRef The raw reference string or number from LLM.
 * @param maxIndex The maximum valid index (abstractions.length - 1).
 * @returns The validated integer index.
 * @throws Error if validation fails.
 */
function parseAbstractionRef(rawRef: any, maxIndex: number): number {
  let indexInt: number;

  if (typeof rawRef === 'number') {
    indexInt = rawRef;
  } else if (typeof rawRef === 'string') {
    const match = rawRef.match(/^(\d+)/);
    if (match && match[1]) {
      indexInt = parseInt(match[1], 10);
    } else {
      throw new Error(`Invalid abstraction reference format: Expected number or 'index # Name', got '${rawRef}'.`);
    }
  } else {
    throw new Error(`Invalid type for abstraction reference: Expected number or string, got ${typeof rawRef}.`);
  }

  if (isNaN(indexInt) || indexInt < 0 || indexInt > maxIndex) {
    throw new Error(`Abstraction index ${indexInt} is out of bounds (0-${maxIndex}).`);
  }
  return indexInt;
}


export async function analyzeRelationships(
  abstractions: Abstraction[],
  filesData: FetchedFile[],
  projectName: string,
  llmProvider: LlmProvider, // Nuevo parámetro
  options: AnalyzeRelationshipsOptions = {}
): Promise<ProjectAnalysis> {
  if (!abstractions || abstractions.length === 0) {
    console.warn("analyzeRelationships called with no abstractions. Returning empty analysis.");
    return { summary: "No abstractions provided to analyze.", relationships: [] };
  }
  if (!filesData || filesData.length === 0) {
    console.warn("analyzeRelationships called with no filesData. This might lead to poor analysis if abstractions refer to files.");
    // Depending on strictness, could return empty or proceed if abstractions don't rely on file content.
  }

  const {
    language = 'english',
    useCache = true,
    llmOptions // Nuevo
  } = options;

  // 1. Create LLM Context
  // List identified abstractions with their indices and names
  const abstractionsListing = abstractions.map((abs, i) => `${i} # ${abs.name}`).join("\n");

  let context = "Identified Abstractions:\n";
  abstractions.forEach((abs, i) => {
    context += `Abstraction Index: ${i}\n`;
    context += `Name: ${abs.name}\n`;
    context += `Description: ${abs.description}\n`;
    context += `Relevant File Indices: [${abs.fileIndices.join(', ')}]\n`;
    // Optionally, include paths for those indices
    const relevantFilePaths = abs.fileIndices.map(fileIdx => filesData[fileIdx]?.path || `Unknown path for index ${fileIdx}`).join(', ');
    context += `Relevant File Paths: ${relevantFilePaths}\n\n`;
  });

  // Gather unique file indices mentioned in abstractions and get their content
  const uniqueFileIndices = new Set<number>();
  abstractions.forEach(abs => abs.fileIndices.forEach(idx => uniqueFileIndices.add(idx)));
  
  context += "Relevant File Snippets (Referenced by Index and Path):\n";
  if (uniqueFileIndices.size === 0) {
    context += "No specific file content referenced by abstractions.\n";
  } else {
    uniqueFileIndices.forEach(fileIdx => {
      const file = filesData[fileIdx];
      if (file) {
        context += `--- File Index ${fileIdx}: ${file.path} ---\n${file.content}\n\n`;
      } else {
        context += `--- File Index ${fileIdx}: Path not found (error in data) ---\n\n`;
      }
    });
  }
  

  // 2. Construct Prompt
  // Ported and adapted from Python version's AnalyzeRelationships node
  const prompt = `
Your task is to analyze the provided software project named "${projectName}" based on a list of identified key abstractions and relevant file snippets.
Your goal is to understand how these abstractions interact and to provide a high-level summary of the project.

You are given:
1.  A list of identified abstractions with their indices, names, descriptions, and the file indices they pertain to.
2.  Content snippets from the relevant files.

Please perform the following:
A.  Write a concise high-level \`summary\` of the project in ${language}. This summary should explain the project's main purpose and how the key abstractions contribute to it.
B.  Identify and list the key \`relationships\` between these abstractions.
    *   Each relationship should specify the source abstraction (\`from_abstraction\`) and the target abstraction (\`to_abstraction\`). Use the format "index # Name" (e.g., "0 # User Authentication") or just the index for these fields.
    *   Provide a descriptive \`label\` for each relationship in ${language} (e.g., "sends data to", "depends on", "invokes method of").
    *   IMPORTANT: Ensure that every abstraction listed below is involved in at least one relationship, either as a source or a target. Try to capture the most significant interactions.

List of Identified Abstractions:
<abstractions_list>
${abstractionsListing}
</abstractions_list>

Please format your entire response as a single YAML object with two top-level keys: \`summary\` and \`relationships\`.
The \`relationships\` key should contain a list of objects, each with \`from_abstraction\`, \`to_abstraction\`, and \`label\`.

Example YAML output:
\`\`\`yaml
summary: "This project is a web server that handles user authentication and data processing. The User Authentication module manages logins, while the Data Processor performs calculations on user-provided data."
relationships:
  - from_abstraction: "0 # User Authentication"
    to_abstraction: "1 # Data Processor"
    label: "passes authenticated user data to"
  - from_abstraction: "1 # Data Processor"
    to_abstraction: "2 # Database Interface"
    label: "fetches records using"
  - from_abstraction: "0 # User Authentication" # Example of an abstraction involved in multiple relationships
    to_abstraction: "2 # Database Interface"
    label: "stores user credentials via"
\`\`\`
${language !== 'english' ? `\nReminder: The 'summary' and relationship 'label' fields MUST be in ${language}. Abstraction names/indices in the relationship list should remain as provided in the <abstractions_list>.\n` : ''}

Here is the context including abstractions details and file contents:
<project_context>
${context}
</project_context>

Now, please provide the YAML output.
`;

  // 3. Call LLM
  const finalLlmOptions: LlmGenerationOptions = {
    ...(llmOptions || {}),
    useCache: useCache,
  };
  console.log(`Calling LLM to analyze relationships for project "${projectName}"...`);
  const llmResponse = await llmProvider.generateContent(prompt, finalLlmOptions);

  // 4. Parse and Validate Output
  let parsedResponse: any;
  try {
    const yamlMatch = llmResponse.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch || !yamlMatch[1]) {
      console.warn("No explicit YAML block found (```yaml ... ```), attempting to parse entire LLM response.");
      try {
        parsedResponse = yaml.load(llmResponse);
      } catch (e: any) {
        throw new Error(`Failed to parse LLM response as YAML (no explicit block, direct parse failed): ${e.message}\nRaw response:\n${llmResponse.substring(0, 500)}...`);
      }
    } else {
      parsedResponse = yaml.load(yamlMatch[1]);
    }
  } catch (e: any) {
    throw new Error(`Invalid YAML from LLM: ${e.message}\nRaw YAML part:\n${(e.mark && e.mark.buffer) ? e.mark.buffer.substring(0, 500) : llmResponse.substring(0,500)}...`);
  }

  if (typeof parsedResponse !== 'object' || parsedResponse === null) {
    throw new Error(`LLM output is not a valid object. Received: ${typeof parsedResponse}`);
  }
  if (typeof parsedResponse.summary !== 'string' || !parsedResponse.summary.trim()) {
    throw new Error(`LLM output missing or empty 'summary'. Received: ${parsedResponse.summary}`);
  }
  if (!Array.isArray(parsedResponse.relationships)) {
    // If relationships are missing but summary is there, consider it a partial success but log warning.
    // Depending on strictness, this could be an error.
    console.warn(`LLM output 'relationships' is not an array or is missing. Received:`, parsedResponse.relationships);
    parsedResponse.relationships = []; // Default to empty array if missing/invalid
  }

  const validatedRelationships: Relationship[] = [];
  const maxAbsIndex = abstractions.length - 1;

  for (const rawRel of parsedResponse.relationships) {
    if (typeof rawRel !== 'object' || rawRel === null) {
      console.warn('Skipping invalid item in relationships (not an object):', rawRel);
      continue;
    }
    if (typeof rawRel.label !== 'string' || !rawRel.label.trim()) {
      console.warn('Skipping relationship with missing or empty label:', rawRel);
      continue;
    }
    if (!rawRel.from_abstraction || !rawRel.to_abstraction) {
      console.warn('Skipping relationship with missing from_abstraction or to_abstraction:', rawRel);
      continue;
    }

    try {
      const fromIndex = parseAbstractionRef(rawRel.from_abstraction, maxAbsIndex);
      const toIndex = parseAbstractionRef(rawRel.to_abstraction, maxAbsIndex);
      
      validatedRelationships.push({
        from: fromIndex,
        to: toIndex,
        label: rawRel.label.trim(),
      });
    } catch (e: any) {
      console.warn(`Skipping relationship due to invalid abstraction reference: ${e.message}`, rawRel);
    }
  }
  
  console.log(`Analyzed relationships. Summary provided. Found ${validatedRelationships.length} valid relationships.`);
  return {
    summary: parsedResponse.summary.trim(),
    relationships: validatedRelationships,
  };
}
