import Foundation
import FoundationModels

@Generable
struct Entry {
  @Guide(description: "One short plain-English sentence: what the quoted part (or the whole text if nothing is quoted) means")
  var meaning: String
  @Guide(description: "Exactly two short, natural example sentences using that word or phrase", .count(2))
  var examples: [String]
}

let instructions = """
You are a concise dictionary. If part of the user's text is wrapped in double quotes, explain ONLY that quoted part as it is used in the sentence. If nothing is quoted, explain the meaning of the whole text (a word, phrase, idiom or sentence). Be brief.
"""

let input = String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self)

let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)
guard case .available = model.availability else {
  FileHandle.standardError.write(Data("Apple on-device model unavailable: \(model.availability)\n".utf8))
  exit(2)
}

do {
  let session = LanguageModelSession(instructions: instructions)
  let r = try await session.respond(to: input, generating: Entry.self)
  let out: [String: Any] = ["meaning": r.content.meaning, "examples": r.content.examples]
  FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: out))
} catch {
  FileHandle.standardError.write(Data("\(error)\n".utf8))
  // 3 = refused by Apple's safety guardrails; the plugin falls back to Claude.
  exit("\(error)".contains("guardrailViolation") ? 3 : 1)
}
