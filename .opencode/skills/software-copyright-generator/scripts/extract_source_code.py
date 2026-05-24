import os
import sys

def extract_code(src_dir, output_file, extensions=('.kt', '.java', '.py', '.js', '.ts', '.cs', '.cpp', '.c', '.h', '.swift', '.go'), max_lines=3000):
    lines = []
    
    # Exclude directories
    exclude_dirs = ['build', 'generated', 'test', 'androidTest', 'venv', '.git', 'node_modules', '.idea', '.gradle', '.cargo', 'target', 'bin', 'obj']
    
    for root, dirs, files in os.walk(src_dir):
        # modify dirs in-place to prune excluded directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
        
        for file in files:
            if file.endswith(extensions):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                        for line in f:
                            cleaned_line = line.strip()
                            if not cleaned_line:
                                continue
                            
                            # Filter block comments starting with Apache/MIT licenses if needed (simplistic approach)
                            lower_line = cleaned_line.lower()
                            if 'licensed under' in lower_line or 'apache license' in lower_line or 'mit license' in lower_line:
                                continue
                            if cleaned_line.startswith('// Copyright') or cleaned_line.startswith('/* Copyright'):
                                continue
                                
                            lines.append(line.rstrip('\n'))
                except Exception as e:
                    print(f"Error reading {filepath}: {e}")

    total_lines = len(lines)
    print(f"Total valid lines extracted: {total_lines}")
    
    result_lines = []
    if total_lines <= max_lines:
        result_lines = lines
    else:
        half = max_lines // 2
        result_lines = lines[:half] + lines[-half:]
        
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("\n".join(result_lines))
        
    print(f"Successfully wrote {len(result_lines)} lines to {output_file}")
    
    if len(result_lines) >= 3000:
        print("Note: The project exceeds 3000 lines. The output file contains the first 1500 and last 1500 lines.")
    else:
        print("Note: The project is under 3000 lines. All code is included.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python extract_source_code.py <src_dir> <output_file>")
        sys.exit(1)
    
    extract_code(sys.argv[1], sys.argv[2])
