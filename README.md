# WebSheets

This repository contains a reference implementation of WebSheets, a new
security paradigm to allow non-programmers to develop secure web applications
using a tabular format. The project is still under development as part of my
Ph.D. studies at Stony Brook University.

A workshop paper has been accepted at NSPW 2015. The submission can be found
[here](http://seclab.cs.sunysb.edu/seclab/pubs/nspw15.pdf).

Below is the abstract of the paper:

> Spreadsheets are a very successful programming paradigm. Their success stems
> from user's familiarity with tabular data, and their previous experience in
> performing manual computations on such data. Since tabular data is familiar to
> users in the context of web applications as well, we propose WebSheets, a new
> paradigm for developing web applications using a spreadsheet like language.
> WebSheets can enable non-programmers to develop simple web applications. More
> importantly, WebSheets enable users to express fine-grained privacy policies
> on their data in a simple manner, thus putting them in charge of their own
> privacy and security concerns.

### Status

- JavaScript/NodeJS rewrite of the old Haskell implementation
- Can run examples found in the NSPW 2015 paper.
- Full-featured web interface.
- Execute I/O upon evaluation (e.g. send mail)

### In Progress

- Execute imperative scripts in a sandbox
- Time-based triggers
- More involved examples
