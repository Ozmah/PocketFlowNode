import yaml from 'js-yaml';
import { FetchedFile } from '../utils/crawl_github_files'; // Assuming this is the correct path
import { Abstraction, IdentifyAbstractionsOptions } from '../types'; // Assuming this is the correct path
import { LlmProvider, LlmGenerationOptions } from '../llm/types';

/**
 * Validates a single raw file index from the LLM output.
 * It can be a number, a string number, or a string like "index # path".
 * @param rawIndex The raw index from LLM.
 * @param maxIndex The maximum valid index (filesData.length - 1).
 * @returns The validated integer index.
 * @throws Error if validation fails.
 */
function validateFileIndex(rawIndex: any, maxIndex: number): number {
  let indexInt: number;

  if (typeof rawIndex === 'number') {
    indexInt = rawIndex;
  } else if (typeof rawIndex === 'string') {
    // Attempt to parse from "index # path" format or just "index"
    const match = rawIndex.match(/^(\d+)/);
    if (match && match[1]) {
      indexInt = parseInt(match[1], 10);
    } else {
      throw new Error(`Invalid file_index format: Expected number or 'index # path', got '${rawIndex}'.`);
    }
  } else {
    throw new Error(`Invalid type for file_index: Expected number or string, got ${typeof rawIndex}.`);
  }

  if (isNaN(indexInt) || indexInt < 0 || indexInt > maxIndex) {
    throw new Error(`file_index ${indexInt} is out of bounds (0-${maxIndex}).`);
  }
  return indexInt;
}


export async function identifyAbstractions(
  filesData: FetchedFile[],
  projectName: string,
  llmProvider: LlmProvider, // Nuevo parámetro
  options: IdentifyAbstractionsOptions = {}
): Promise<Abstraction[]> {
  if (!filesData || filesData.length === 0) {
    console.warn("identifyAbstractions called with no filesData. Returning empty array.");
    return [];
  }

  const {
    language = 'english',
    useCache = true, // useCache se mantiene para construir finalLlmOptions
    maxAbstractions = 10,
    llmOptions // Nuevo
  } = options;

  // 1. Create LLM Context
  let filesContext = "";
  const fileListingForPrompt: string[] = [];
  filesData.forEach((file, i) => {
    filesContext += `--- File Index ${i}: ${file.path} ---\n${file.content}\n\n`;
    fileListingForPrompt.push(`${i} # ${file.path}`);
  });
  const fileListingStr = fileListingForPrompt.join("\n");

  // 2. Construct Prompt
  // Adapted from Python version's IdentifyAbstractions node
  const prompt = `
Your task is to identify the key abstractions in the provided codebase for a project named "${projectName}".
An abstraction can be a function, class, module, interface, or a significant variable/constant that represents a core concept.
Focus on abstractions that are central to understanding the project's architecture and functionality.

You will be given the content of several files from the project.
Below is a list of the files provided, with their corresponding indices:
<file_listing>
${fileListingStr}
</file_listing>

Please identify up to ${maxAbstractions} key abstractions. For each abstraction, provide:
1.  \`name\`: A concise and descriptive name for the abstraction.
2.  \`description\`: A brief explanation of what the abstraction does or represents.
3.  \`file_indices\`: A list of integer file indices where this abstraction is primarily defined or heavily used. Use the indices from the file listing above. For example, if an abstraction is defined in the first file (\`0 # path/to/file1.js\`) and used in the third (\`2 # path/to/file3.js\`), list \`[0, 2]\`. If it's only in one file, provide a single index in the list, e.g., \`[0]\`.

${language !== 'english' ? `IMPORTANT: Please provide the 'name' and 'description' fields in ${language}. The file paths and indices should remain as they are.\nExample for ${language}:\nname: (name in ${language})\ndescription: (description in ${language})\nfile_indices: [0, 1]` : ''}

Please format your response as a YAML list. Each item in the list should be an object with the keys \`name\`, \`description\`, and \`file_indices\`.
Do not include any explanations or text outside the YAML block.

Example YAML output:
\`\`\`yaml
- name: "User Authentication"
  description: "Handles user login, registration, and session management."
  file_indices: [0, 2]
- name: "Database Connection"
  description: "Manages the connection to the primary database."
  file_indices: [1]
\`\`\`

Here is the combined content of the project files:
<file_contents>
${filesContext}
</file_contents>

Now, please provide the YAML list of abstractions.
`;

  // 3. Call LLM
  const finalLlmOptions: LlmGenerationOptions = {
    ...(llmOptions || {}), // Opciones genéricas pasadas (ej: model, temperature)
    // useCache se pasa como una opción más; el proveedor (Gemini) sabrá qué hacer con ella.
    // Para otros proveedores, podría ser ignorada si no es relevante.
    useCache: useCache,
  };
  console.log(`Calling LLM to identify abstractions for project "${projectName}"...`);
  const llmResponse = await llmProvider.generateContent(prompt, finalLlmOptions);

  // 4. Parse and Validate Output
  let rawAbstractions: any;
  try {
    // Extract YAML block (simple extraction, might need refinement for more complex LLM outputs)
    const yamlMatch = llmResponse.match(/```yaml\n([\s\S]*?)\n```/);
    if (!yamlMatch || !yamlMatch[1]) {
      // Fallback: try to parse the whole response if no explicit block found
      console.warn("No explicit YAML block found (```yaml ... ```), attempting to parse entire LLM response.");
      try {
        rawAbstractions = yaml.load(llmResponse);
      } catch (e: any) {
         throw new Error(`Failed to parse LLM response as YAML (no explicit block and direct parse failed): ${e.message}\nRaw response:\n${llmResponse.substring(0, 500)}...`);
      }
    } else {
        rawAbstractions = yaml.load(yamlMatch[1]);
    }
  } catch (e: any) {
    throw new Error(`Invalid YAML from LLM: ${e.message}\nRaw YAML part:\n${(e.mark && e.mark.buffer) ? e.mark.buffer.substring(0, 500) : llmResponse.substring(0,500)}...`);
  }

  if (!Array.isArray(rawAbstractions)) {
    // Sometimes the LLM might return a single object if only one abstraction is found.
    // Let's wrap it in an array if it looks like a valid abstraction object.
    if (rawAbstractions && typeof rawAbstractions === 'object' && rawAbstractions.name && rawAbstractions.description && rawAbstractions.file_indices) {
        console.warn("LLM returned a single object, not an array. Wrapping it.");
        rawAbstractions = [rawAbstractions];
    } else {
        throw new Error(`LLM output is not an array of abstractions. Received: ${typeof rawAbstractions}\nContent:\n${JSON.stringify(rawAbstractions, null, 2).substring(0, 500)}...`);
    }
  }

  const validatedAbstractions: Abstraction[] = [];
  const maxValidIndex = filesData.length - 1;

  for (const rawAbs of rawAbstractions) {
    if (typeof rawAbs !== 'object' || rawAbs === null) {
      console.warn('Skipping invalid item in LLM output (not an object):', rawAbs);
      continue;
    }
    if (typeof rawAbs.name !== 'string' || !rawAbs.name.trim()) {
      console.warn('Skipping abstraction with missing or empty name:', rawAbs);
      continue;
    }
    if (typeof rawAbs.description !== 'string' || !rawAbs.description.trim()) {
      console.warn('Skipping abstraction with missing or empty description:', rawAbs);
      continue;
    }
    if (!Array.isArray(rawAbs.file_indices) || rawAbs.file_indices.length === 0) {
      console.warn(`Skipping abstraction "${rawAbs.name}" with missing, empty, or non-array file_indices:`, rawAbs.file_indices);
      continue;
    }

    try {
      const validatedIndices = rawAbs.file_indices.map((idx: any) => validateFileIndex(idx, maxValidIndex));
      validatedAbstractions.push({
        name: rawAbs.name.trim(),
        description: rawAbs.description.trim(),
        fileIndices: validatedIndices,
        // 'files' field can be populated here if needed, by mapping validatedIndices to filesData[i].path
        // files: validatedIndices.map(i => filesData[i].path) 
      });
    } catch (e: any) {
      console.warn(`Skipping abstraction "${rawAbs.name}" due to invalid file_indices: ${e.message}`, rawAbs.file_indices);
    }
  }
  
  console.log(`Identified ${validatedAbstractions.length} abstractions successfully.`);
  return validatedAbstractions;
}
