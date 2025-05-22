import {
  Abstraction,
  FetchedFile,
  ChapterOutput,
  WriteChaptersOptions,
  ChapterLinkInfo,
} from '../types';
import { LlmProvider, LlmGenerationOptions } from '../llm/types';

// Helper function to sanitize chapter names for filenames
// Exported for testing purposes
export function sanitizeFilename(name: string, chapterNum: number): string {
  const prefix = chapterNum.toString().padStart(2, '0');
  // Trim leading/trailing whitespace first, then sanitize
  const trimmedName = name.trim();
  let sanitized = trimmedName
    .toLowerCase()
    .replace(/\s+/g, '_') // Replace internal spaces with underscores
    .replace(/[^\w_.-]/g, ''); // Remove non-alphanumeric characters except underscore, dot, hyphen
  
  // If sanitization (after removing special chars) results in an empty string 
  // or only underscores (which can happen if the original name was just spaces or just special chars),
  // then default to "chapter".
  if (!sanitized.replace(/_/g, '')) { // Check if string is empty after removing underscores
    sanitized = 'chapter';
  }
  
  return `${prefix}_${sanitized}.md`;
}

export async function writeChapters(
  chapterOrder: number[], // Array of abstraction indices in the desired order
  abstractions: Abstraction[],
  filesData: FetchedFile[],
  projectName: string,
  llmProvider: LlmProvider, // Nuevo parámetro
  options: WriteChaptersOptions = {}
): Promise<ChapterOutput[]> {
  if (!chapterOrder || chapterOrder.length === 0) {
    console.warn('writeChapters called with no chapterOrder. Returning empty array.');
    return [];
  }
  if (!abstractions || abstractions.length === 0) {
    console.warn('writeChapters called with no abstractions. Returning empty array.');
    return [];
  }

  const { 
    language = 'english', 
    useCache = true, 
    llmOptions // Nuevo
  } = options;

  const chaptersWrittenSoFarSummary: string[] = []; // Stores summaries or full content for context
  const allChapterOutputs: ChapterOutput[] = [];

  // 1. Prepare Full Chapter Listing & Filenames Map
  const chapterLinkInfos: ChapterLinkInfo[] = chapterOrder.map((absIndex, i) => {
    const abstractionName = abstractions[absIndex]?.name || `Unknown Abstraction ${absIndex}`;
    const chapterNum = i + 1;
    return {
      num: chapterNum,
      name: abstractionName, // This name might be translated by LLM if chapters are written in other languages
      filename: sanitizeFilename(abstractionName, chapterNum),
    };
  });
  
  const chapterFilenamesMap = new Map<number, ChapterLinkInfo>(); // Keyed by abstractionIndex
  chapterOrder.forEach((absIndex, i) => {
    chapterFilenamesMap.set(absIndex, chapterLinkInfos[i]);
  });

  const fullChapterListingForPrompt = chapterLinkInfos
    .map(info => `${info.num}. [${info.name}](${info.filename})`)
    .join('\n');

  // 2. Iterate and Generate Chapters
  for (let i = 0; i < chapterOrder.length; i++) {
    const abstractionIndex = chapterOrder[i];
    const currentAbstraction = abstractions[abstractionIndex];
    const chapterNum = i + 1;
    const currentChapterLinkInfo = chapterFilenamesMap.get(abstractionIndex)!;

    if (!currentAbstraction) {
      console.warn(`Skipping chapter ${chapterNum}: Abstraction with index ${abstractionIndex} not found.`);
      continue;
    }

    const abstractionName = currentAbstraction.name;
    const abstractionDescription = currentAbstraction.description;

    // Fetch content of related files
    let relevantCodeSnippets = '';
    if (currentAbstraction.fileIndices && currentAbstraction.fileIndices.length > 0) {
      currentAbstraction.fileIndices.forEach(fileIdx => {
        const file = filesData[fileIdx];
        if (file) {
          relevantCodeSnippets += `--- Code from ${file.path} ---\n${file.content}\n\n`;
        } else {
          relevantCodeSnippets += `--- Code from file index ${fileIdx} (Path not found) ---\n\n`;
        }
      });
    } else {
      relevantCodeSnippets = 'No specific code snippets directly associated with this abstraction by index. Focus on its conceptual role based on its description and relationships.\n';
    }

    // Determine previous and next chapter links
    const prevChapterLink = i > 0 ? chapterLinkInfos[i-1] : null;
    const nextChapterLink = i < chapterOrder.length - 1 ? chapterLinkInfos[i+1] : null;
    
    let transitionsContext = "";
    if (prevChapterLink) {
        transitionsContext += `You have just learned about "${prevChapterLink.name}" in the previous chapter ([${prevChapterLink.name}](${prevChapterLink.filename})).\n`;
    }
    if (nextChapterLink) {
        transitionsContext += `In the next chapter ([${nextChapterLink.name}](${nextChapterLink.filename})), we will explore "${nextChapterLink.name}".\n`;
    }


    // Construct Prompt (ported from Python's WriteChapters node)
    // This is a very complex prompt, ensure all details are captured.
    const prompt = `
Your task is to write a detailed chapter for a software tutorial about the project "${projectName}".
This chapter focuses on the abstraction: "${abstractionName}".
Its general description is: "${abstractionDescription}".
The chapter number is: ${chapterNum}.

The tutorial will have the following chapters (current chapter is ${chapterNum}. ${abstractionName}):
<full_chapter_listing>
${fullChapterListingForPrompt}
</full_chapter_listing>

Context from previously written chapters (summaries or key points):
<previous_chapters_summary>
${chaptersWrittenSoFarSummary.join('\n\n---\n\n')}
</previous_chapters_summary>

Relevant code snippets for "${abstractionName}":
<code_snippets>
${relevantCodeSnippets}
</code_snippets>

Please write the chapter content in Markdown format. The chapter MUST be written entirely in ${language}.
This includes all explanatory text, comments in code examples, and any other textual content.

Chapter Structure and Guidelines:

1.  **Heading**: Start with a clear heading for the chapter (e.g., \`# Chapter ${chapterNum}: ${abstractionName}\`).
2.  **Introduction**:
    *   Briefly introduce the abstraction and its purpose in the project.
    *   State the chapter's learning objectives.
    *   **Transitions**: Smoothly transition from the previous chapter and set expectations for the next.
        *   ${prevChapterLink ? `Reference the previous chapter: "[${prevChapterLink.name}](${prevChapterLink.filename})".` : "This is the first chapter."}
        *   ${nextChapterLink ? `Tease the next chapter: "[${nextChapterLink.name}](${nextChapterLink.filename})".` : "This is the last chapter."}
        *   Use this context: ${transitionsContext}
3.  **Motivation**: Explain *why* this abstraction is important and what problems it solves within "${projectName}".
4.  **Concept Breakdown**:
    *   Explain the core concepts of the abstraction in detail.
    *   Use analogies or real-world examples if helpful.
    *   If the abstraction interacts with other core abstractions from the full chapter listing, link to them using their generated filenames (e.g., \`[Other Abstraction Name](filename_for_other_abstraction.md)\`).
5.  **Usage Examples (if applicable)**:
    *   Show simple, clear examples of how to use this abstraction.
    *   Provide code snippets in Markdown code blocks. Keep them short, focused, and well-commented (comments also in ${language}).
    *   Explain the code examples thoroughly.
6.  **Internal Implementation (if relevant and insightful)**:
    *   Briefly explain key aspects of its internal workings if it helps understanding. Do not overwhelm with details.
    *   Consider using Mermaid sequence diagrams (\`\`\`mermaid\\nsequenceDiagram\\n...\`\`\`) or flowcharts (\`\`\`mermaid\\nflowchart TD\\n...\`\`\`) if they clarify interactions or logic. Ensure diagram syntax is correct and comments/text within diagrams are in ${language}.
7.  **Code Blocks**:
    *   Code should be simplified for clarity. Focus on the concept being explained.
    *   All comments within code blocks MUST be in ${language}.
    *   Use appropriate language tags for syntax highlighting (e.g., \`\`\`typescript).
8.  **Linking**: When mentioning other core abstractions that have their own chapters (see full chapter listing), link to them using their markdown filenames. E.g., "As we saw in [${prevChapterLink?.name || 'a previous chapter'}](${prevChapterLink?.filename || 'previous_chapter.md'}), and we will see how it connects to [${nextChapterLink?.name || 'a future chapter'}](${nextChapterLink?.filename || 'next_chapter.md'})."
9.  **Diagrams (Optional but encouraged for complex interactions)**:
    *   Use Mermaid diagrams for flowcharts, sequence diagrams, class diagrams, etc., where appropriate. Ensure diagram syntax is correct and comments/text within diagrams are in ${language}. E.g. \`\`\`mermaid\\nflowchart TD\\nA --> B\\n\`\`\`
    *   Ensure any text within diagrams (nodes, labels, comments) is in ${language}.
10. **Tone**: Maintain a welcoming, encouraging, and clear tone. Assume the reader is a developer trying to understand "${projectName}".
11. **Conclusion**:
    *   Summarize what was learned in the chapter.
    *   Briefly reiterate how this abstraction fits into the bigger picture of "${projectName}".
    *   Transition to the next chapter if applicable.

IMPORTANT Multi-language Instructions:
- The entire chapter content, including headings, explanatory text, analogies, code comments, and any text in diagrams, MUST be in ${language}.
- If "${abstractionName}" or "${abstractionDescription}" are in English and the target language is different, translate them appropriately for use within the chapter text. However, the primary chapter heading should still be based on the original "${abstractionName}" for consistency in structure, perhaps with a translated subtitle if natural. For example: \`# Chapter ${chapterNum}: ${abstractionName} (Título en ${language})\`.
- When linking to other chapters, use their original names for the link text as provided in \`<full_chapter_listing>\` but ensure the link path uses the generated filename. E.g., \`[Original Chapter Name X](0X_filename_x.md)\`.

Now, please generate the Markdown content for Chapter ${chapterNum}: "${abstractionName}".
Do not include the prompt or any other text outside the chapter's Markdown content itself.
Start directly with the chapter heading.
`;

    console.log(`Writing Chapter ${chapterNum}: "${abstractionName}" (Abstraction Index: ${abstractionIndex}) using LLM...`);
    let chapterContent = await callLlm(prompt, { useCache });

    // Basic validation/cleanup: Ensure heading is present (as per Python version)
    if (!chapterContent.trim().startsWith('#')) {
        console.warn(`LLM output for chapter ${chapterNum} ("${abstractionName}") did not start with a heading. Prepending a default one.`);
        chapterContent = `# Chapter ${chapterNum}: ${abstractionName}\n\n${chapterContent}`;
    }
    // Add more cleanup if necessary, e.g., trimming whitespace
    
    // Add to chaptersWrittenSoFarSummary (using full content for now, could be a summary later)
    // Justo antes de: console.log(`Writing Chapter ${chapterNum}: "${abstractionName}" ...`);

    const finalLlmOptions: LlmGenerationOptions = {
      ...(llmOptions || {}),
      useCache: useCache,
    };
    console.log(`Writing Chapter ${chapterNum}: "${abstractionName}" (Abstraction Index: ${abstractionIndex}) using LLM...`);
    let chapterContent = await llmProvider.generateContent(prompt, finalLlmOptions);

    // Basic validation/cleanup: Ensure heading is present (as per Python version)
    if (!chapterContent.trim().startsWith('#')) {
        console.warn(`LLM output for chapter ${chapterNum} ("${abstractionName}") did not start with a heading. Prepending a default one.`);
        chapterContent = `# Chapter ${chapterNum}: ${abstractionName}\n\n${chapterContent}`;
    }
    chaptersWrittenSoFarSummary.push(`## Summary of Chapter ${chapterNum}: ${abstractionName}\n${chapterContent.substring(0, 500)}...`); // Simple summary

    allChapterOutputs.push({
      chapterNumber: chapterNum,
      abstractionIndex: abstractionIndex,
      title: abstractionName, // Use the original abstraction name for title consistency
      content: chapterContent,
      filename: currentChapterLinkInfo.filename,
    });

    console.log(`Finished writing Chapter ${chapterNum}: "${abstractionName}".`);
  }

  console.log(`All ${allChapterOutputs.length} chapters written successfully.`);
  return allChapterOutputs;
}
