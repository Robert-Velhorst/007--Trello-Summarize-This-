package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/printer"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
)

func run() error {
	directory := "/tmp/consumer"
	if err := os.Mkdir(directory, 0700); err != nil {
		return err
	}
	for _, name := range []string{"generic_feed.go", "enum.go", "bridge.go", "service.go", "fetcher.go"} {
		fileSet := token.NewFileSet()
		source, err := parser.ParseFile(fileSet, filepath.Join("/probe/sources", name), nil, 0)
		if err != nil {
			return err
		}
		source.Name.Name = "main"
		declarations := []ast.Decl{}
		for _, declaration := range source.Decls {
			if name == "fetcher.go" {
				// Preserve the actual parser size bound without including live fetchers.
				if group, ok := declaration.(*ast.GenDecl); ok && group.Tok == token.CONST {
					for _, spec := range group.Specs {
						value := spec.(*ast.ValueSpec)
						if len(value.Names) == 1 && value.Names[0].Name == "maxFeedBytes" {
							declarations = append(declarations, &ast.GenDecl{Tok: token.CONST, Specs: []ast.Spec{value}})
						}
					}
				}
				continue
			}
			if name == "service.go" {
				group, ok := declaration.(*ast.GenDecl)
				if !ok || group.Tok != token.TYPE {
					continue
				}
				for _, spec := range group.Specs {
					typeSpec := spec.(*ast.TypeSpec)
					if typeSpec.Name.Name == "ImportItem" || typeSpec.Name.Name == "jsonFeedEnvelope" {
						declarations = append(declarations, &ast.GenDecl{Tok: token.TYPE, Specs: []ast.Spec{typeSpec}})
					}
				}
				continue
			}
			// Conversion to HAI operations is outside this parser/schema probe.
			if function, ok := declaration.(*ast.FuncDecl); ok && name == "generic_feed.go" &&
				(function.Name.Name == "ToFeedItem" || function.Name.Name == "operationTypeForItem") {
				continue
			}
			if function, ok := declaration.(*ast.FuncDecl); ok && name == "bridge.go" {
				// Keep provider parsing; live bridge connection status is outside this probe.
				switch function.Name.Name {
				case "allProviders", "String", "IsValid", "ParseProvider":
				default:
					continue
				}
			}
			declarations = append(declarations, declaration)
		}
		source.Decls = declarations
		output, err := os.Create(filepath.Join(directory, name))
		if err != nil {
			return err
		}
		printErr := printer.Fprint(output, fileSet, source)
		closeErr := output.Close()
		if printErr != nil {
			return printErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	check, err := os.ReadFile("/probe/consumer-check.go.txt")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(directory, "main.go"), check, 0600); err != nil {
		return err
	}
	command := exec.Command("go", "run", ".")
	command.Dir = directory
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	return command.Run()
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
